import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";

const DELAY = 1000; // ms

type AudioPlayerProps = {
  src: string;
  fallbackSrc?: string;
  onStart: () => void;
  onEnded: () => void;
};

export type AudioPlayerHandle = {
  stop: () => void;
  play: () => void;
};

export const AudioPlayer = forwardRef<AudioPlayerHandle, AudioPlayerProps>(
  ({ src, fallbackSrc, onStart, onEnded }, ref) => {
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

      const handlePlay = () => onStartRef.current();
      const handleEnded = () => onEndedRef.current();
      const handleError = () => {
        console.log("[AudioPlayer] failed to load:", audio.src);
        if (fallbackSrc && audio.src !== fallbackSrc) {
          console.log("[AudioPlayer] trying fallback:", fallbackSrc);
          audio.src = fallbackSrc;
          audio.load();
          audio.play();
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

    // expose stop/play methods to parent via ref
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
