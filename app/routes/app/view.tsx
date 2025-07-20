import React, { useEffect, useState, useCallback } from "react";
import type { loader } from "./app.loader";
import { useLoaderData, Link } from "@remix-run/react";
import { useConversation } from "@11labs/react";
import { MainButton } from "components/MainButton/MainButton";
import { useTranscriptStore } from "../../stores/transcriptStore";
import { Circles } from "components/Circles/Circles";
import { trackEvent } from "~/utils/googleAnalytics";
import { useNetworkStatus } from "~/hooks/useNetworkStatus";
import { ErrorMessage } from "components/ErrorMessage/ErrorMessage";

const ParentComponent: React.FC = () => {
  const [error, setError] = useState<string | null>(null);

  // mic access
  const [micAllowed, setMicAllowed] = useState<boolean | null>(null);

  // user coordinates
  const [coords, setCoords] = useState<{ lat: number; long: number } | null>(
    null
  );

  // check for network availability
  const isOnline = useNetworkStatus();
  useEffect(() => {
    if (!isOnline) {
      console.warn("You're offline");
    } else {
      console.log("You're back online");
    }
  }, [isOnline]);

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

  // tracks the response time from the AI
  let responseTimeComparison: Date | null = null;

  const conversation = useConversation({
    onConnect: () => {
      setAttentionConnected(true);
    },
    onDisconnect: () => {
      setAttentionConnected(false);
    },
    onMessage: (message) => {
      const now = new Date();
      let responseTime;
      if (message.source === "user") {
        setAvatarState("processing");
        responseTimeComparison = now;
      }
      if (message.source === "ai") {
        setAvatarState("speaking");

        // set the response time
        responseTime = responseTimeComparison
          ? now.getTime() - responseTimeComparison.getTime()
          : undefined;

        responseTimeComparison = null;
      }
      addEntry(
        {
          timestamp: new Date(),
          text: message.message,
          speaker: message.source,
          location: coords ?? undefined,
          ...(responseTime !== undefined && { response_time: responseTime }),
        },
        user?.id
      );
    },
    onError: (error) => {
      setError(error);
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
      setError("Couldn't start the conversation");
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
      stream.getTracks().forEach((track) => track.stop());
    } catch (err) {
      setMicAllowed(false);
      //setError("Microphone access denied or unavailable.");
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
        //setError("Permission denied or error retrieving location");
        setCoords({ lat: 0, long: 0 });
      }
    );
  }, []);

  useEffect(() => {
    if (conversation.status === "connecting") {
      setAvatarState("processing");
    }
    if (conversation.status === "connected") {
      setAvatarState("preconnect");
      setTimeout(() => {
        setAvatarState("connected");
      }, 250); // matches preconnect transition duration
    }
    if (conversation.status === "disconnected") {
      setAvatarState("idle");
    }
  }, [conversation.status]);

  useEffect(() => {
    conversation.isSpeaking
      ? setAvatarState("speaking")
      : conversation.status === "disconnected"
      ? setAvatarState("idle")
      : setAvatarState("connected");
  }, [conversation.isSpeaking]);

  return (
    <>
      <div className="fixed w-dvw h-dvh top-0 left-0 pointer-events-none">
        <Circles mode={avatarState}></Circles>
      </div>

      {error && (
        <div className="mt-3">
          <ErrorMessage message={error} />
        </div>
      )}
      <MainButton
        className="fixed left-1/2 -translate-x-1/2 bottom-14 z-20"
        onPress={handleMainButtonPress}
        active={attentionConnected}
      ></MainButton>

      <div className="fixed bottom-0 left-0 w-full items-center z-10">
        <div className="max-w-[1024px] mx-auto pb-2 px-8">
          <Link to="/history">
            <img
              src="/icons/Bookmark.png"
              className="size-[46px]"
              alt="view history"
            />
          </Link>
        </div>
      </div>
    </>
  );
};

export default ParentComponent;
