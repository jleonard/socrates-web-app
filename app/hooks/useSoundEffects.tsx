import { useCallback, useEffect, useRef } from "react";

/**
 * The agent's sound effects. To change a sound, replace its mp3 (or point src
 * at another file in public/). volume is a gain: 1 = as recorded, above 1
 * boosts a quiet file. enabled: false mutes a sound (it isn't loaded or
 * played) without touching the code that triggers it.
 */
export const SOUND_EFFECTS = {
  // the session connected
  // muted for now: testing the processing sound on its own
  on: { src: "/audio/agent/on.mp3", volume: 0.5, enabled: false },
  // the session ended (tap, agent hang-up, timeout, dropped connection)
  off: { src: "/audio/agent/off.mp3", volume: 0.5, enabled: false },
  // a conversation error or a failed start (played instead of off)
  error: { src: "/audio/agent/error.mp3", volume: 0.5, enabled: false },
  // looped while the agent works on a reply
  // processing.mp3 is mastered very quiet (peak 0.107, RMS -38 dBFS vs -8 for
  // on.mp3), hence the boost; 9 (peak ~0.96) was too loud in testing, 4 too quiet
  processing: {
    src: "/audio/agent/processing.mp3",
    volume: 5,
    enabled: true,
  },
};

export type SoundEffect = keyof typeof SOUND_EFFECTS;

const PROCESSING = {
  // quick replies (small talk) arrive in under a second: don't blip on those
  startDelayMs: 700,
  // safety net if the agent never answers
  maxMs: 15_000,
  fadeMs: 150,
};

/**
 * Plays SOUND_EFFECTS through Web Audio: volume that works on iOS
 * (HTMLAudioElement.volume is ignored there), a gapless processing loop and a
 * fast fade-out the moment the agent speaks. A missing file only logs a warning.
 */
export function useSoundEffects() {
  const ctxRef = useRef<AudioContext | null>(null);
  const buffersRef = useRef<
    Partial<Record<SoundEffect, Promise<AudioBuffer | null>>>
  >({});
  const processingRef = useRef<{
    source: AudioBufferSourceNode;
    gain: GainNode;
  } | null>(null);
  const delayRef = useRef<ReturnType<typeof setTimeout>>();
  const maxRef = useRef<ReturnType<typeof setTimeout>>();
  // bumped by every start/stop, so a start that's still loading can tell it was cancelled
  const runRef = useRef(0);

  /**
   * Call from a tap handler: iOS only plays Web Audio that was unlocked by a
   * user gesture. Also loads the files, once.
   */
  const prepare = useCallback(() => {
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") void ctx.resume();

    for (const name of Object.keys(SOUND_EFFECTS) as SoundEffect[]) {
      const { src, enabled } = SOUND_EFFECTS[name];
      if (!enabled) continue;
      buffersRef.current[name] ??= fetch(src)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.arrayBuffer();
        })
        .then((data) => ctx.decodeAudioData(data))
        .catch((err) => {
          console.warn(`[sound effects] couldn't load ${src}`, err);
          delete buffersRef.current[name]; // retry on the next tap
          return null;
        });
    }
  }, []);

  /** Starts a sound now, fading in over fadeMs (0 = no fade). */
  const startSource = useCallback(
    async (name: SoundEffect, loop: boolean, fadeMs: number) => {
      const ctx = ctxRef.current;
      const buffer = await buffersRef.current[name];
      if (!ctx || !buffer) return null;
      // iOS can suspend the context when the mic session starts
      if (ctx.state !== "running") void ctx.resume();

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = loop;
      const gain = ctx.createGain();
      const { volume } = SOUND_EFFECTS[name];
      if (fadeMs > 0) {
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(
          volume,
          ctx.currentTime + fadeMs / 1000,
        );
      } else {
        gain.gain.value = volume;
      }
      source.connect(gain).connect(ctx.destination);
      source.start();
      return { source, gain };
    },
    [],
  );

  const stopProcessing = useCallback(() => {
    runRef.current++;
    clearTimeout(delayRef.current);
    clearTimeout(maxRef.current);

    const ctx = ctxRef.current;
    const playing = processingRef.current;
    processingRef.current = null;
    if (!ctx || !playing) return;

    const now = ctx.currentTime;
    const end = now + PROCESSING.fadeMs / 1000;
    playing.gain.gain.cancelScheduledValues(now);
    playing.gain.gain.setValueAtTime(playing.gain.gain.value, now);
    playing.gain.gain.linearRampToValueAtTime(0, end);
    playing.source.stop(end);
  }, []);

  /** Starts the processing loop after startDelayMs, unless stopProcessing() is called first. */
  const startProcessing = useCallback(() => {
    stopProcessing();
    const run = runRef.current;
    delayRef.current = setTimeout(async () => {
      const playing = await startSource("processing", true, PROCESSING.fadeMs);
      if (!playing) return;
      // stopProcessing() may have run while the file was still loading
      if (run !== runRef.current) {
        playing.source.stop();
        return;
      }
      processingRef.current = playing;
      maxRef.current = setTimeout(stopProcessing, PROCESSING.maxMs);
    }, PROCESSING.startDelayMs);
  }, [stopProcessing, startSource]);

  /** Plays a one-shot sound (on, off, error); stops the processing loop. */
  const play = useCallback(
    (name: Exclude<SoundEffect, "processing">) => {
      stopProcessing();
      void startSource(name, false, 0);
    },
    [stopProcessing, startSource],
  );

  useEffect(
    () => () => {
      stopProcessing();
      void ctxRef.current?.close();
    },
    [stopProcessing],
  );

  return { prepare, play, startProcessing, stopProcessing };
}
