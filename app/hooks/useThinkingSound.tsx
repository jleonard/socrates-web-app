import { useCallback, useEffect, useRef } from "react";

/**
 * The loop played while the agent is working on a reply. To change the
 * sound, replace the mp3 (or point src at another file in public/).
 */
export const THINKING_SOUND = {
  src: "/audio/thinking/thinking.mp3",
  volume: 0.4,
  // quick replies (small talk) arrive in under a second: don't blip on those
  startDelayMs: 700,
  // safety net if the agent never answers
  maxMs: 15_000,
  fadeMs: 150,
};

/**
 * Plays THINKING_SOUND on a loop through Web Audio: gapless looping, volume
 * that works on iOS (HTMLAudioElement.volume is ignored there) and a fast
 * fade-out the moment the agent speaks.
 */
export function useThinkingSound() {
  const ctxRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<Promise<AudioBuffer | null> | null>(null);
  const playingRef = useRef<{
    source: AudioBufferSourceNode;
    gain: GainNode;
  } | null>(null);
  const delayRef = useRef<ReturnType<typeof setTimeout>>();
  const maxRef = useRef<ReturnType<typeof setTimeout>>();
  // bumped by every start/stop, so a start that's still loading can tell it was cancelled
  const runRef = useRef(0);

  /**
   * Call from a tap handler: iOS only plays Web Audio that was unlocked by a
   * user gesture. Also loads the file, once.
   */
  const prepare = useCallback(() => {
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") void ctx.resume();

    bufferRef.current ??= fetch(THINKING_SOUND.src)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data))
      .catch((err) => {
        console.warn(
          `[thinking sound] couldn't load ${THINKING_SOUND.src}`,
          err,
        );
        bufferRef.current = null; // retry on the next tap
        return null;
      });
  }, []);

  const stop = useCallback(() => {
    runRef.current++;
    clearTimeout(delayRef.current);
    clearTimeout(maxRef.current);

    const ctx = ctxRef.current;
    const playing = playingRef.current;
    playingRef.current = null;
    if (!ctx || !playing) return;

    const now = ctx.currentTime;
    const end = now + THINKING_SOUND.fadeMs / 1000;
    playing.gain.gain.cancelScheduledValues(now);
    playing.gain.gain.setValueAtTime(playing.gain.gain.value, now);
    playing.gain.gain.linearRampToValueAtTime(0, end);
    playing.source.stop(end);
  }, []);

  /** Starts the loop after startDelayMs, unless stop() is called first. */
  const start = useCallback(() => {
    stop();
    const run = runRef.current;
    delayRef.current = setTimeout(async () => {
      const ctx = ctxRef.current;
      const buffer = await bufferRef.current;
      // stop() may have run while the file was still loading
      if (!ctx || !buffer || run !== runRef.current) return;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(
        THINKING_SOUND.volume,
        ctx.currentTime + THINKING_SOUND.fadeMs / 1000,
      );
      source.connect(gain).connect(ctx.destination);
      source.start();

      playingRef.current = { source, gain };
      maxRef.current = setTimeout(stop, THINKING_SOUND.maxMs);
    }, THINKING_SOUND.startDelayMs);
  }, [stop]);

  useEffect(
    () => () => {
      stop();
      void ctxRef.current?.close();
    },
    [stop],
  );

  return { prepare, start, stop };
}
