import React, { useEffect, useState, useCallback } from "react";
import type { loader } from "./app.loader";
import { useLoaderData } from "@remix-run/react";
import { useConversation } from "@11labs/react";
import { MainButton } from "components/MainButton/MainButton";
import { Transcript } from "components/Transcript/Transcript";
import { Avatar } from "components/Avatar/Avatar";
import { useTranscriptStore } from "../../stores/transcriptStore";
import { Circles } from "components/Circles/Circles";
import { trackEvent } from "~/utils/googleAnalytics";

const ParentComponent: React.FC = () => {
  const [error, setError] = useState<string | null>(null);

  // mic access
  const [micAllowed, setMicAllowed] = useState<boolean | null>(null);

  // user coordinates
  const [coords, setCoords] = useState<{ lat: number; long: number } | null>(
    null
  );

  type AvatarState =
    | "idle"
    | "connected"
    | "speaking"
    | "processing"
    | "error"
    | "preconnect";

  const [attentionConnected, setAttentionConnected] = useState(false);
  const [avatarState, setAvatarState] = useState<AvatarState>("idle");

  const { elevenLabsId, user } = useLoaderData<typeof loader>();

  const addEntry = useTranscriptStore((state) => state.addEntry);

  const conversation = useConversation({
    onConnect: () => {
      console.log("user::", user);
      setAvatarState("preconnect");
      setTimeout(() => {
        setAvatarState("connected");
      }, 250); // matches preconnect transition duration
      setAttentionConnected(true);
    },
    onDisconnect: () => {
      setAvatarState("idle");
      setAttentionConnected(false);
    },
    onMessage: (message) => {
      console.log("Message:", message);
      if (message.source === "user") {
        setAvatarState("processing");
      }
      if (message.source === "ai") {
        setAvatarState("speaking");
      }
      addEntry({
        timestamp: new Date(),
        text: message.message,
        speaker: message.source,
        location: coords ?? undefined,
      });
    },
    onError: (error) => {
      console.error("Error:", error);
      setAttentionConnected(false);
    },
  });

  const startConversation = useCallback(async () => {
    const user_lat = coords?.lat ?? 0;
    const user_long = coords?.long ?? 0;
    try {
      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Start the conversation with your agent
      await conversation.startSession({
        agentId: elevenLabsId, // Replace with your agent ID
        dynamicVariables: { user_lat, user_long },
      });
    } catch (error) {
      // todo - this is an attention error.
      console.error("Error: to start conversation:", error);
    }
  }, [conversation]);

  const stopConversation = useCallback(async () => {
    await conversation.endSession();
  }, [conversation]);

  const handleMainButtonPress = () => {
    if (!attentionConnected) {
      startConversation();
      trackEvent({
        action: "user-conversation-started",
        category: "conversation",
        label: "press to connect",
      });
    } else {
      trackEvent({
        action: "user-conversation-ended",
        category: "conversation",
        label: "press to disconnect",
      });
      stopConversation();
    }
  };

  const requestMicAccess = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicAllowed(true);
      // Optional: Do something with the stream
      stream.getTracks().forEach((track) => track.stop()); // Stop the mic if you're not using it yet
    } catch (err) {
      setMicAllowed(false);
      setError("Microphone access denied or unavailable.");
    }
  };

  useEffect(() => {
    requestMicAccess();
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude,
          long: position.coords.longitude,
        });
      },
      (err) => {
        setError("Permission denied or error retrieving location");
        setCoords({ lat: 0, long: 0 });
        console.error(err);
      }
    );
  }, []);

  useEffect(() => {
    conversation.isSpeaking
      ? setAvatarState("speaking")
      : conversation.status === "disconnected"
      ? setAvatarState("idle")
      : setAvatarState("connected");
  }, [conversation.isSpeaking]);

  return (
    <>
      <div className="flex flex-col items-center gap-4">
        <div className="fixed bottom-2 right-2 bg-zinc-50 text-slate-500 rounded-sm shadow-lg p-4 flex flex-col pointer-events-none opacity-20">
          <h3>Attention state</h3>
          <p>status: {conversation.status}</p>
          <p>
            isSpeaking: {conversation.isSpeaking ? "speaking" : "listening"}
          </p>
        </div>
      </div>

      <div className="fixed w-dvw h-dvh top-0 left-0 pointer-events-none">
        <Circles mode={avatarState}></Circles>
      </div>
      <div className="opacity-0 pointer-events-none">
        <Transcript />
      </div>

      <MainButton
        className="fixed left-1/2 -translate-x-1/2 bottom-14 z-20"
        onPress={handleMainButtonPress}
        active={attentionConnected}
      ></MainButton>
    </>
  );
};

export default ParentComponent;
