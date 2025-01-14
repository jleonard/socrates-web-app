import React, { useState, useRef } from "react";
import { useGlobalStore } from "../web-stt";

interface SpeechRecognitionButtonProps {
  onTranscript: (transcript: string) => void; // Callback to pass the transcript
  className?: string;
}

const SpeechRecognitionButton: React.FC<SpeechRecognitionButtonProps> = ({
  className,
  onTranscript,
}) => {
  const { isRecording, setIsRecording, setIsWaiting } = useGlobalStore();
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const startRecognition = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.error("Web Speech API is not supported in this browser.");
      return;
    }

    if (!recognitionRef.current) {
      const recognition = new SpeechRecognition();
      recognition.lang = "en-US"; // Set the language
      recognition.interimResults = false; // Capture only final results

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0][0].transcript; // Capture the transcript
        onTranscript(transcript);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error("Speech recognition error:", event.error);
      };

      recognitionRef.current = recognition;
    }

    recognitionRef.current.start();
    setIsRecording(true);
    setIsListening(true);
  };

  const stopRecognition = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      setIsRecording(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onMouseDown={startRecognition}
        disabled={isListening}
        className={className}
      >
        {isListening ? "Listening..." : "Hold to Speak"}
      </button>
      {isRecording && (
        <button
          onMouseDown={stopRecognition}
          disabled={!isListening}
          className={className}
        >
          Stop
        </button>
      )}
    </div>
  );
};

export default SpeechRecognitionButton;
