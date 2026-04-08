import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";

const DELAY = 1000; // ms

type AudioPlayerProps = {
  src: string;
  onStart: () => void;
  onEnded: () => void;
};

export type AudioPlayerHandle = {
  stop: () => void;
  play: () => void;
};

export const AudioPlayer = forwardRef<AudioPlayerHandle, AudioPlayerProps>(
  ({ src, onStart, onEnded }, ref) => {
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

      audio.addEventListener("play", handlePlay);
      audio.addEventListener("ended", handleEnded);

      timerRef.current = setTimeout(() => {
        //audio.play();
      }, DELAY);

      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        audio.pause();
        audio.removeEventListener("play", handlePlay);
        audio.removeEventListener("ended", handleEnded);
      };
    }, [src]);

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
