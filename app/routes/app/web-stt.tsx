import React, { useState } from "react";
import SpeechRecognitionButton from "./components/record-button";
import WavPlayer from "./components/wav-player";
import { useLoaderData } from "@remix-run/react";

import { create } from "zustand";
import VoiceBars from "./components/voice-bars";
import AgentWaiting from "./components/agent-waiting";
import type { loader } from "./app.loader";

interface GlobalStore {
  agentStateString: string;
  isRecording: boolean;
  isSpeaking: boolean;
  isWaiting: boolean;

  startRecording: () => void;
  stopRecording: () => void;

  startWaiting: () => void;
  stopWaiting: () => void;

  startSpeaking: () => void;
  stopSpeaking: () => void;
}

// Define the store
export const useGlobalStore = create<GlobalStore>((set) => ({
  isRecording: false,
  isWaiting: false,
  isSpeaking: false,
  agentStateString: "idle",

  startRecording: () =>
    set({
      isRecording: true,
      isSpeaking: false,
      isWaiting: false,
      agentStateString: "recording",
    }),

  stopRecording: () => set({ isRecording: false }),

  startSpeaking: () =>
    set({
      isRecording: false,
      isSpeaking: true,
      isWaiting: false,
      agentStateString: "speaking",
    }),

  stopSpeaking: () => set({ isSpeaking: false }),

  startWaiting: () =>
    set({
      isRecording: false,
      isSpeaking: false,
      isWaiting: true,
      agentStateString: "waiting",
    }),

  stopWaiting: () => set({ isWaiting: false }),
}));

const ParentComponent: React.FC = () => {
  const n8nEndpoint = process.env.N8N_URL!;
  const data = useLoaderData<typeof loader>();
  const { isRecording, isWaiting, isSpeaking, startWaiting, stopWaiting } =
    useGlobalStore();

  const [curUrl, setCurUrl] = useState<string | undefined>(undefined);

  const handleTranscript = (transcript: string) => {
    console.log(
      "Received transcript from the record-button component:",
      transcript
    );
    startWaiting();

    // post the transscript to n8n to start the workflow
    console.log("n8nEndpoint ", n8nEndpoint);
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
        stopWaiting();
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
        <SpeechRecognitionButton className="" onTranscript={handleTranscript} />
        {isSpeaking && <VoiceBars />}
        {isWaiting && <AgentWaiting />}
        <WavPlayer className="fixed bottom-4 right-4 opacity-0" url={curUrl} />
      </div>
    </div>
  );
};

export default ParentComponent;
