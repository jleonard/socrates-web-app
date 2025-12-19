import React, { useEffect, useState, useCallback } from "react";
import type { loader } from "./loader";
import {
  useLoaderData,
  Link,
  useSubmit,
  useRevalidator,
  useNavigate,
} from "react-router";
import * as Sentry from "@sentry/react";
import { useConversation } from "@elevenlabs/react";
import { MainButton } from "components/MainButton/MainButton";
import { MainButtonModes } from "components/MainButton/MainButton.types";
import { PurchaseButton } from "components/PurchaseButton/PurchaseButton";
import { useTranscriptStore } from "../../stores/transcriptStore";
import { Circles } from "components/Circles/Circles";
import { CircleMode } from "components/Circles/Circles.types";
import { trackEvent } from "~/utils/googleAnalytics";
import { useNetworkStatus } from "~/hooks/useNetworkStatus";
import { EBMMessage } from "components/EBMMessage/EBMMessage";
import LocationModal from "components/LocationModal/LocationModal";

import { AvatarConnection, AvatarMode } from "types/avatar";
import { useSyncPromo } from "~/hooks/useSyncPromo";
import { createBrowserClient } from "@supabase/ssr";

import { Stopwatch } from "components/Stopwatch/Stopwatch";
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
  const supabase = createBrowserClient(
    env.SUPABASE_URL!,
    env.SUPABASE_ANON_KEY!
  );
  useSyncPromo(supabase, user_profile.user_id);

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

  const addEntry = useTranscriptStore((state) => state.addEntry);

  // check for network availability
  const isOnline = useNetworkStatus();
  useEffect(() => {
    setHasInternet(isOnline);
    if (!isOnline) {
      //console.warn("You're offline");
    } else {
      //console.log("You're back online");
    }
  }, [isOnline]);

  // tracks the response time from the AI
  let responseTimeComparison: Date | null = null;

  const conversation = useConversation({
    onConnect: () => {
      //console.log("onConnect()");
      setButtonMode("listening");
      setCircleMode("preconnect");
      setTimeout(() => {
        setCircleMode("connected");
      }, 250); // matches preconnect transition duration
    },
    onDisconnect: () => {
      setCircleMode("idle");
      setButtonMode("disconnected");
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
    onError: (error: string) => {
      Sentry.captureMessage(error, "error");
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
      if (error instanceof Error) {
        Sentry.captureException(error);
      } else {
        Sentry.captureException(
          new Error(
            `app view : startConversation failed: ${JSON.stringify(error)}`
          )
        );
      }
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
      // if the access doesn't have an expiration, set it
      if (!access?.expiration) {
        //console.log("setting an expiration date ", access);
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
      if (err instanceof Error) {
        Sentry.captureException(err);
      } else {
        Sentry.captureException(
          new Error(`requestMicAccess failed: ${JSON.stringify(err)}`)
        );
      }
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
    // @todo - turn back on when ready
    setShowLocationModal(false);
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

      {access?.category !== "expired" ? (
        <>
          <MainButton
            className="fixed left-1/2 -translate-x-1/2 bottom-20 z-20"
            onPress={handleMainButtonPress}
            mode={buttonMode}
          ></MainButton>
        </>
      ) : (
        <>
          <PurchaseButton
            className="fixed left-1/2 -translate-x-1/2 bottom-20 z-20"
            onClick={() => navigate("/purchase")}
            cta={
              <>
                <span className="font-bold text-lg block">
                  Enjoyed WonderWay?
                </span>
                <span>Unlock more time to continue exploring</span>
              </>
            }
          >
            <span className="font-bold">Unlock</span>
          </PurchaseButton>
          <span className="fixed left-1/2 -translate-x-1/2 bottom-2 z-20 text-center text-sm">
            <span className="font-bold">$5</span> Day Pass{"  "}
            <br />
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

      <div className="fixed bottom-5 right-5 z-50 hidden">
        <Stopwatch />
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
