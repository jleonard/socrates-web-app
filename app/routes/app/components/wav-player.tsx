import React, { useEffect, useRef } from "react";

import { useGlobalStore } from "../web-stt";

// Define the component's props type
interface WavPlayerProps {
  url?: string;
  className?: string;
}

const WavPlayer: React.FC<WavPlayerProps> = ({ url, className }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { startSpeaking, stopSpeaking } = useGlobalStore();

  // Whenever the URL changes, trigger playback
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.load(); // Reload audio source
      audioRef.current.play(); // Start playing the audio
    }
  }, [url]); // Only run this when the `url` changes

  if (!url) {
    return <span></span>;
  }

  const handlePlay = () => {
    startSpeaking();
  };

  // Event handler for when playback ends
  const handleEnded = () => {
    stopSpeaking();
  };

  return (
    <div className={className}>
      <audio
        ref={audioRef}
        controls
        autoPlay
        onPlay={handlePlay}
        onEnded={handleEnded}
      >
        <source src={url} type="audio/wav" />
        Your browser does not support the audio element.
      </audio>
    </div>
  );
};

export default WavPlayer;
