import React, { useRef } from "react";
import { useGlobalStore } from "../web-stt";

interface SpeechRecognitionButtonProps {
  onTranscript: (transcript: string) => void; // Callback to pass the transcript
  className?: string;
}

const SpeechRecognitionButton: React.FC<SpeechRecognitionButtonProps> = ({
  className,
  onTranscript,
}) => {
  const { isRecording, startRecording, stopRecording } = useGlobalStore();
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
    startRecording();
  };

  const stopRecognition = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      stopRecording();
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onMouseDown={startRecognition}
        disabled={isRecording}
        className={className}
      >
        {isRecording ? "Listening..." : "Hold to Speak"}
      </button>
      {isRecording && (
        <button
          onMouseDown={stopRecognition}
          disabled={!isRecording}
          className={className}
        >
          Stop
        </button>
      )}
    </div>
  );
};

export default SpeechRecognitionButton;
