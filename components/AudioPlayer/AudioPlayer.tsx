import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

const DELAY = 1000; // ms

type AudioPlayerProps = {
  src: string;
  fallbackSrc?: string[];
  onStart: () => void;
  onEnded: () => void;
};

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
      const handleEnded = () => onEndedRef.current();
      const handleError = () => {
        console.log("[AudioPlayer] failed to load:", audio.src);

        fallbackIndex += 1;
        const nextSrc = fallbackSrc[fallbackIndex];

        if (nextSrc) {
          console.log("[AudioPlayer] trying fallback:", nextSrc);
          audio.src = nextSrc;
          audio.load();
          audio.play();
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
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        }
      },
      play: () => {
        if (audioRef.current) {
          audioRef.current.play();
        }
      },
    }));

    return null;
  },
);
