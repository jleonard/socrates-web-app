import React, { useEffect, useState, useCallback } from "react";
import type { loader } from "./loader";
import {
  useLoaderData,
  Link,
  useSubmit,
  useRevalidator,
  useNavigate,
} from "@remix-run/react";
import { useConversation } from "@elevenlabs/react";
import { MainButton } from "components/MainButton/MainButton";
import { PurchaseButton } from "components/PurchaseButton/PurchaseButton";
import { useTranscriptStore } from "../../stores/transcriptStore";
import { Circles } from "components/Circles/Circles";
import { trackEvent } from "~/utils/googleAnalytics";
import { useNetworkStatus } from "~/hooks/useNetworkStatus";
import { EBMMessage } from "components/EBMMessage/EBMMessage";
import LocationModal from "components/LocationModal/LocationModal";
import { useSyncPromo } from "~/hooks/useSyncPromo";
import { createBrowserClient } from "@supabase/ssr";
import { DebugPanel } from "components/DebugPanel/DebugPanel";

const ParentComponent: React.FC = () => {
  const { access, elevenLabsId, sessionId, user, user_profile, env } =
    useLoaderData<typeof loader>();

  // this is used to post to the action
  const submit = useSubmit();
  // this is used to refresh the page when we want
  // to call the loader again
  const revalidator = useRevalidator();

  const navigate = useNavigate();

  // associate any promo code to the user's account
  const supabase = createBrowserClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  useSyncPromo(supabase, user_profile.user_id);

  type AvatarState =
    | "idle"
    | "connected"
    | "speaking"
    | "processing"
    | "error"
    | "preconnect";

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

  const [attentionConnected, setAttentionConnected] = useState(false);

  // controls the avatar animation state
  const [avatarState, setAvatarState] = useState<AvatarState>("idle");

  // used to set the text under the button
  const stateText: Record<AvatarState, string | null> = {
    idle: "Press to talk",
    connected: "Ask away",
    speaking: "Talking",
    processing: "Just a moment",
    error: null, // or "Error" if you want to show something
    preconnect: "Connecting", // or some other string
  };

  // this is used to render the spinner in the main button when elevenlabs is connecting.
  const [avatarConnecting, setConnectingState] = useState(false);

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
      setAttentionConnected(true);
    },
    onDisconnect: () => {
      setAttentionConnected(false);
    },

    onMessage: (message) => {
      const now = new Date();
      let responseTime;
      if (message.source === "user") {
        responseTimeComparison = now;
      }
      if (message.source === "ai") {
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
      setError("Couldn't start the conversation");
    }
  }, [conversation, user, coords, elevenLabsId]);

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
      // if the access doesn't have an expiration, set it
      if (!access?.expiration) {
        console.log("setting an expiration date ", access);
        const formData = new FormData();
        formData.append("access_id", access.access_id);
        submit(formData, { method: "post" });
      }
    } else {
      trackEvent({
        action: "user-conversation-ended",
        category: "conversation",
        label: "press to disconnect",
      });
      stopConversation();
      if (access?.expiration > Date.now()) {
        console.log("expired! revalidate ", access);
        revalidator.revalidate();
      }
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
    let previousState = avatarState;

    // if speaking => speaking
    if (conversation.isSpeaking) {
      setAvatarState("speaking");
      return;
    }

    // if is connected but was idle
    if (conversation.status === "connected" && previousState === "idle") {
      setAvatarState("preconnect");
      setTimeout(() => {
        setAvatarState("connected");
      }, 250); // matches preconnect transition duration
      return;
    }

    // if !speaking && connected => connected
    if (
      !conversation.isSpeaking &&
      previousState === "speaking" &&
      conversation.status === "connected"
    ) {
      setAvatarState("connected");
      return;
    }

    // if disconnected => idle
    if (conversation.status === "disconnected") {
      setAvatarState("idle");
    }
  }, [conversation.isSpeaking, conversation.status]);

  useEffect(() => {
    if (conversation.status === "connecting") {
      setConnectingState(true);
    } else {
      setConnectingState(false);
    }
  }, [conversation.status]);

  return (
    <>
      <div className="fixed w-dvw h-dvh top-0 left-0 pointer-events-none pt-14">
        <Circles mode={avatarState}></Circles>
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

      {access?.category !== "expired" ? (
        <>
          <MainButton
            className="fixed left-1/2 -translate-x-1/2 bottom-20 z-20"
            onPress={handleMainButtonPress}
            active={attentionConnected}
            loading={avatarConnecting}
          />
          <span className="fixed left-1/2 -translate-x-1/2 bottom-12 z-20">
            {avatarConnecting === true ? "Connecting" : stateText[avatarState]}
          </span>
        </>
      ) : (
        <>
          <PurchaseButton
            className="fixed left-1/2 -translate-x-1/2 bottom-20 z-20"
            onClick={() => navigate("/purchase")}
            cta={
              <>
                <span className="font-bold text-lg block">Enjoyed Ayapi?</span>
                <span>Unlock more time to continue exploring</span>
              </>
            }
          >
            <span className="font-bold">Unlock</span>
          </PurchaseButton>
          <span className="fixed left-1/2 -translate-x-1/2 bottom-4 z-20 text-center">
            <span className="font-bold">$5</span> Day Pass{"  "}·{"  "}
            <span className="font-bold">$15</span> Week Pass <br /> No
            subscription
          </span>
        </>
      )}

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
