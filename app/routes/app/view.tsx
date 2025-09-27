import React, { useEffect, useState, useCallback } from "react";
import type { loader } from "./loader";
import { useLoaderData, Link } from "@remix-run/react";
import { useConversation } from "@elevenlabs/react";
import { MainButton } from "components/MainButton/MainButton";
import { MainButtonModes } from "components/MainButton/MainButton.types";
import { useTranscriptStore } from "../../stores/transcriptStore";
import { Circles } from "components/Circles/Circles";
import { CircleMode } from "components/Circles/Circles.types";
import { trackEvent } from "~/utils/googleAnalytics";
import { useNetworkStatus } from "~/hooks/useNetworkStatus";
import { EBMMessage } from "components/EBMMessage/EBMMessage";
import LocationModal from "components/LocationModal/LocationModal";

import { AvatarConnection, AvatarMode } from "types/avatar";

const ParentComponent: React.FC = () => {
  // used for errors that should be presented to the user
  const [error, setError] = useState<string | null>(null);

  // mic access
  const [, setMicAllowed] = useState<boolean | null>(null);

  // user coordinates
  const [coords, setCoords] = useState<{ lat: number; long: number } | null>(
    null
  );

  // used to present 'no internet' dialog to the user
  const [hasInternet, setHasInternet] = useState(true);

  // Location permission modal state
  const [showLocationModal, setShowLocationModal] = useState(false);

  const [locationPermissionStatus, setLocationPermissionStatus] = useState<
    "pending" | "granted" | "denied"
  >("pending");

  // NEW
  const [avatarConnection, setAvatarConnection] =
    useState<AvatarConnection>("disconnected");

  const [buttonMode, setButtonMode] = useState<MainButtonModes>("disconnected");
  const [circleMode, setCircleMode] = useState<CircleMode>("idle");

  const { elevenLabsId, sessionId, user } = useLoaderData<typeof loader>();

  const addEntry = useTranscriptStore((state) => state.addEntry);

  // check for network availability
  const isOnline = useNetworkStatus();
  useEffect(() => {
    setHasInternet(isOnline);
    if (!isOnline) {
      console.warn("You're offline");
    } else {
      console.log("You're back online");
    }
  }, [isOnline]);

  // tracks the response time from the AI
  let responseTimeComparison: Date | null = null;

  const conversation = useConversation({
    onConnect: () => {
      console.log("onConnect()");
      setButtonMode("listening");
      setCircleMode("preconnect");
      setTimeout(() => {
        setCircleMode("connected");
      }, 250); // matches preconnect transition duration
    },
    onDisconnect: () => {
      console.log("onDisconnect()");
      setCircleMode("idle");
      setButtonMode("disconnected");
    },

    onMessage: (message) => {
      const now = new Date();
      let responseTime;
      if (message.source === "user") {
        // setAvatarState("processing"); testing
        responseTimeComparison = now;
      }
      if (message.source === "ai") {
        // setAvatarState("speaking"); testing

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
    onModeChange: (modeObj) => {
      console.log("onModeChange(", modeObj.mode, ")");
      if (modeObj.mode === "listening") {
        setCircleMode("connected");
        setButtonMode("listening");
      }
      if (modeObj.mode === "speaking") {
        setCircleMode("speaking");
        setButtonMode("speaking");
      }
    },
    onError: (error) => {
      console.log("error: ", error);
      setError(error);
    },
  });

  const startConversation = useCallback(async () => {
    const user_lat = coords?.lat ?? 0;
    const user_long = coords?.long ?? 0;
    const user_session = `${user.id}__${sessionId}`;
    const conversation_id = crypto
      .randomUUID()
      .split("-")
      .slice(0, 2)
      .join("-");
    try {
      // Request microphone permission
      await requestMicAccess();
      //await navigator.mediaDevices.getUserMedia({ audio: true });

      // Start the conversation with your agent
      await conversation.startSession({
        agentId: elevenLabsId,
        connectionType: "webrtc",
        dynamicVariables: {
          user_lat,
          user_long,
          user_session,
          conversation_id,
        },
      });

      // TODO: Implementar envío de mensaje contextual cuando tengamos el método correcto
      // El contexto ya está enviado via dynamicVariables por ahora
    } catch (error) {
      // todo - this is an attention error.
      console.error("Error: to start conversation:", error);
      setError("Couldn't start the conversation");
    }
  }, [conversation, user, coords, elevenLabsId]);

  const stopConversation = useCallback(async () => {
    await conversation.endSession();
  }, [conversation]);

  const handleMainButtonPress = () => {
    if (
      avatarConnection === "disconnected" ||
      avatarConnection === "disconnecting"
    ) {
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
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicAllowed(true);
      //stream.getTracks().forEach((track) => track.stop());
    } catch (err) {
      setMicAllowed(false);
    }
  };

  const requestLocationPermission = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      setLocationPermissionStatus("denied");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude,
          long: position.coords.longitude,
        });
        setLocationPermissionStatus("granted");
        setShowLocationModal(false);
      },
      () => {
        // Si el usuario deniega o hay error, usar coordenadas del MET en desarrollo
        if (
          window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1"
        ) {
          setCoords({
            lat: 40.7794, // MET Museum, NYC
            long: -73.9632,
          });
          setLocationPermissionStatus("granted");
        } else {
          setLocationPermissionStatus("denied");
          setCoords(null);
        }
        setShowLocationModal(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000, // 5 minutos
      }
    );
  };

  const handleLocationModalClose = () => {
    setShowLocationModal(false);
    // Si el usuario cierra el modal sin dar permisos, usar coordenadas por defecto en desarrollo
    if (locationPermissionStatus === "pending") {
      if (
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1"
      ) {
        setCoords({
          lat: 40.7794, // MET Museum, NYC
          long: -73.9632,
        });
      } else {
        setCoords(null);
      }
      setLocationPermissionStatus("denied");
    }
  };

  // Effect to show location modal on mount
  useEffect(() => {
    // Mostrar el modal de permisos de ubicación al cargar la app
    setShowLocationModal(true);
  }, []);

  useEffect(() => {
    setAvatarConnection(conversation.status);
  }, [conversation.status]);

  useEffect(() => {
    if (avatarConnection === "connecting") {
      // CONNECTING
      setCircleMode("processing");
      setButtonMode("connecting");
    }
  }, [avatarConnection]);

  return (
    <>
      <div className="fixed w-dvw h-dvh top-0 left-0 pointer-events-none pt-14">
        <Circles mode={circleMode}></Circles>
      </div>

      {error && (
        <div className="mt-3">
          <EBMMessage variant="error" message={error} />
        </div>
      )}

      {!hasInternet && (
        <div className="mt-3">
          <EBMMessage variant="warning" message="You're offline." />
        </div>
      )}

      {/* Location Permission Modal */}
      {showLocationModal && (
        <LocationModal
          onAllow={requestLocationPermission}
          onClose={handleLocationModalClose}
        />
      )}

      <MainButton
        className="fixed left-1/2 -translate-x-1/2 bottom-20 z-20"
        onPress={handleMainButtonPress}
        mode={buttonMode}
      ></MainButton>

      <div className="fixed bottom-0 left-0 w-full items-center z-10">
        <div className="max-w-[1024px] mx-auto pb-4 px-8">
          <Link to="/history">
            <img
              src="/icons/Bookmark.svg"
              className="size-[38px]"
              alt="view history"
            />
          </Link>
        </div>
      </div>
      {/*
      <div className="fixed bottom-2 right-2 w-32 z-40 pointer-events-none bg-black text-white p-2 rounded-sm">
        <span>
          conversation status:{" "}
          <span className="text-green-400">{conversation.status}</span>
        </span>
        <br />
        <span>
          avatar state: <span className="text-green-400">{avatarState}</span>
        </span>
      </div>*/}
    </>
  );
};

export default ParentComponent;
