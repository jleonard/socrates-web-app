import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

const DELAY = 1000; // ms

type AudioPlayerProps = {
  src: string;
  fallbackSrc?: string[];
  onStart: () => void;
  onEnded: () => void;
};

/**
 * play() returns a promise that rejects when the browser blocks playback
 * (no tap yet, iOS rules) or the source is broken. Unhandled, each rejection
 * became a Sentry error for MIT visitors; a skipped greeting isn't one.
 */
function safePlay(audio: HTMLAudioElement) {
  audio.play()?.catch((err: unknown) => {
    console.log(
      "[AudioPlayer] play() rejected:",
      err instanceof Error ? `${err.name}: ${err.message}` : err,
    );
  });
}

export type AudioPlayerHandle = {
  stop: () => void;
  play: () => void;
};

export const AudioPlayer = forwardRef<AudioPlayerHandle, AudioPlayerProps>(
  ({ src, fallbackSrc = [], onStart, onEnded }, ref) => {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onStartRef = useRef(onStart);
    const onEndedRef = useRef(onEnded);
    // true between play() and stop(): a fallback that finishes loading after
    // the visitor asked for the greeting should still start
    const wantPlayRef = useRef(false);

    useEffect(() => {
      onStartRef.current = onStart;
      onEndedRef.current = onEnded;
    }, [onStart, onEnded]);

    useEffect(() => {
      const audio = new Audio(src);
      audioRef.current = audio;

      // -1 means "currently playing `src`, haven't touched fallbacks yet".
      // 0..n-1 indexes into fallbackSrc as each one is tried in turn.
      let fallbackIndex = -1;

      const handlePlay = () => onStartRef.current();
      const handleEnded = () => {
        wantPlayRef.current = false;
        onEndedRef.current();
      };
      const handleError = () => {
        console.log("[AudioPlayer] failed to load:", audio.src);

        fallbackIndex += 1;
        const nextSrc = fallbackSrc[fallbackIndex];

        if (nextSrc) {
          console.log("[AudioPlayer] trying fallback:", nextSrc);
          audio.src = nextSrc;
          audio.load();
          // Load errors usually happen before the visitor taps, so just
          // switch sources and wait: the tap then plays the working file.
          // Only play now if they already asked (may be blocked outside the
          // tap on iOS; that's caught, not thrown).
          if (wantPlayRef.current) safePlay(audio);
        } else {
          console.log("[AudioPlayer] no more fallbacks, giving up");
        }
      };

      audio.addEventListener("play", handlePlay);
      audio.addEventListener("ended", handleEnded);
      audio.addEventListener("error", handleError);

      timerRef.current = setTimeout(() => {
        //audio.play();
      }, DELAY);

      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        audio.pause();
        audio.removeEventListener("play", handlePlay);
        audio.removeEventListener("ended", handleEnded);
        audio.removeEventListener("error", handleError);
      };
    }, [src, fallbackSrc]);

    useImperativeHandle(ref, () => ({
      stop: () => {
        wantPlayRef.current = false;
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        }
      },
      play: () => {
        wantPlayRef.current = true;
        if (audioRef.current) safePlay(audioRef.current);
      },
    }));

    return null;
  },
);
