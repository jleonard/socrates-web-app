import React from "react";
import type { loader } from "./app.loader";
import { useConversation } from "@11labs/react";
import { useCallback, useState } from "react";
import { MainButton } from "components/MainButton/MainButton";
import { Transcript } from "components/Transcript/Transcript";
import { Avatar } from "components/Avatar/Avatar";
import { useTranscriptStore } from "../../stores/transcriptStore";

const ParentComponent: React.FC = () => {
  const [attentionConnected, setAttentionConnected] = useState(false);
  const [attentionError, setAttentionError] = useState(false);
  const [attentionThinking, setAttentionThinking] = useState(false);

  const addEntry = useTranscriptStore((state) => state.addEntry);

  const conversation = useConversation({
    onConnect: () => {
      console.log("Connected");
      setAttentionConnected(true);
    },
    onDisconnect: () => {
      console.log("Disconnected");
      setAttentionConnected(false);
    },
    onMessage: (message) => {
      console.log("Message:", message);
      if (message.source === "user") {
        setAttentionThinking(true);
      }
      if (message.source === "ai") {
        setAttentionThinking(false);
      }
      addEntry({
        timestamp: new Date(),
        text: message.message,
        speaker: message.source,
      });
    },
    onError: (error) => {
      console.error("Errory:", error);
    },
  });

  const startConversation = useCallback(async () => {
    try {
      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Start the conversation with your agent
      await conversation.startSession({
        agentId: "vSIN4qZQknqFJJiIdsfW", // Replace with your agent ID
      });
    } catch (error) {
      // todo - this is an attention error.
      console.error("Errory: to start conversation:", error);
    }
  }, [conversation]);

  const stopConversation = useCallback(async () => {
    await conversation.endSession();
  }, [conversation]);

  const handleMainButtonPress = () => {
    if (!attentionConnected) {
      startConversation();
    } else {
      stopConversation();
    }
  };

  return (
    <>
      <div className="flex flex-col items-center gap-4">
        <div className="fixed bottom-2 right-2 bg-zinc-50 text-slate-500 rounded-sm shadow-lg p-4 flex flex-col">
          <h3>Attention state</h3>
          <p>status: {conversation.status}</p>
          <p>
            isSpeaking: {conversation.isSpeaking ? "speaking" : "listening"}
          </p>
        </div>
      </div>

      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <Avatar
          mode={
            !attentionConnected
              ? "idle"
              : conversation.isSpeaking
              ? "speaking"
              : "listening"
          }
        />
      </div>
      <div className="opacity-0">
        <Transcript />
      </div>

      <MainButton
        className="fixed left-1/2 -translate-x-1/2 bottom-20"
        onPress={handleMainButtonPress}
        active={attentionConnected}
      ></MainButton>
    </>
  );
};

export default ParentComponent;
