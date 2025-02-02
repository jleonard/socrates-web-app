import React, { useState } from "react";
import SpeechRecognitionButton from "./components/record-button";
import WavPlayer from "./components/wav-player";
import { useLoaderData } from "@remix-run/react";

import { create } from "zustand";
import VoiceBars from "./components/voice-bars";
import type { loader } from "./app.loader";

const n8nEndpoint = "https://jleonard.app.n8n.cloud/webhook/go-time";

interface GlobalStore {
  isRecording: boolean;
  setIsRecording: (bool: boolean) => void;

  isSpeaking: boolean;
  setIsSpeaking: (bool: boolean) => void;

  isWaiting: boolean;
  setIsWaiting: (bool: boolean) => void;
}

// Define the store
export const useGlobalStore = create<GlobalStore>((set) => ({
  isRecording: false,
  setIsRecording: (bool: boolean) => set({ isRecording: bool }),

  isWaiting: false,
  setIsWaiting: (bool: boolean) => set({ isWaiting: bool }),

  isSpeaking: false,
  setIsSpeaking: (bool: boolean) => set({ isSpeaking: bool }),
}));

const ParentComponent: React.FC = () => {
  const data = useLoaderData<typeof loader>();
  console.log("user ....||||  ", data);
  const { isRecording, isWaiting, setIsWaiting, isSpeaking } = useGlobalStore();
  const [curUrl, setCurUrl] = useState<string | undefined>(undefined);

  const handleTranscript = (transcript: string) => {
    console.log(
      "Received transcript from the record-button component:",
      transcript
    );
    setIsWaiting(true);

    // post the transscript to n8n to start the workflow
    fetch(n8nEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ transcript }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Network response was not ok");
        }
        return response.json(); // Parse the JSON response from n8n
      })
      .then((data) => {
        console.log("Received data:", data);
        setCurUrl(data.wav); // Set the .wav URL to state to start playback
      })
      .catch((error) => {
        console.error("Error sending data:", error);
        // todo handle the error
      })
      .finally(() => {
        setIsWaiting(false);
      });
  };

  return (
    <div>
      <div className="absolute top-4 right-4">
        {isRecording && (
          <div className="bg-red-600 text-red-100 p-2">recording</div>
        )}
        {isWaiting && (
          <div className="bg-orange-400 text-orange-950 p-2">waiting</div>
        )}
      </div>
      <div className="flex flex-col items-center justify-center w-screen h-screen">
        <SpeechRecognitionButton
          className="p-4 bg-red-600 text-white rounded-sm absolute top-2 left-2"
          onTranscript={handleTranscript}
        />
        {isSpeaking && <VoiceBars />}
        <WavPlayer className="fixed bottom-4 right-4 opacity-0" url={curUrl} />
        boofy
      </div>
    </div>
  );
};

export default ParentComponent;
