import { ConversationProvider, useConversation } from "@elevenlabs/react";
import * as Sentry from "@sentry/react";
import { MainButton } from "components/MainButton/MainButton";
import { MainButtonModes } from "components/MainButton/MainButton.types";
import { PurchaseButton } from "components/PurchaseButton/PurchaseButton";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  useLoaderData,
  useNavigate,
  useRevalidator,
  useSubmit,
} from "react-router";
import { logAppEventFromClient } from "~/utils/events/appEvents.client";
import { DEFAULT_LOCALE } from "~/utils/i18n/config";
import {
  setConversationTag,
  setPlaceTag,
  setVisitorScope,
  step,
} from "~/utils/observability.client";
import type { loader } from "./loader";

// stores
import { usePlaceStore } from "~/stores/placeStore";
import { useTranscriptStore } from "../../stores/transcriptStore";

import { AudioPlayer } from "components/AudioPlayer/AudioPlayer";
import { Circles } from "components/Circles/Circles";
import { CircleMode } from "components/Circles/Circles.types";
import { EBMMessage } from "components/EBMMessage/EBMMessage";
import { GreetingButton } from "components/GreetingButton/GreetingButton";
import LocationModal from "components/LocationModal/LocationModal";
import { OfflineDialog } from "components/OfflineDialog/OfflineDialog";
import { useNetworkStatus } from "~/hooks/useNetworkStatus";
import { useSoundEffects } from "~/hooks/useSoundEffects";
import { useSpeechStats } from "~/hooks/useSpeechStats";
import { trackEvent } from "~/utils/googleAnalytics";

import { AvatarConnection, AvatarMode } from "types/avatar";

import { Stopwatch } from "components/Stopwatch/Stopwatch";
import { UserPen } from "lucide-react";
import {
  Coords,
  getFreshLocation,
  rememberLocation,
  requestInitialLocation,
  resolvePendingPermission,
} from "~/utils/location.client";

/**
 * How long the agent must stay quiet before the UI goes from "speaking" back
 * to "listening". Longer than a pause between sentences, short enough that
 * the end of a reply still feels immediate.
 */
const AGENT_PAUSE_MS = 500;

const ParentComponent: React.FC = () => {
  const { t } = useTranslation();
  const {
    access,
    elevenLabsId,
    startLanguage,
    shouldPlayGreeting,
    sessionId,
    user,
    user_profile,
    place,
    locale,
  } = useLoaderData<typeof loader>();

  // this is used to post to the action
  const submit = useSubmit();

  // this is used to refresh the page when we want
  // to call the loader again
  const revalidator = useRevalidator();

  const navigate = useNavigate();

  // used for errors that should be presented to the user
  const [error, setError] = useState<string | null>(null);

  // mic access
  const [, setMicAllowed] = useState<boolean | null>(null);

  // user coordinates
  const [coords, setCoords] = useState<{ lat: number; long: number } | null>(
    null,
  );

  // used to present 'no internet' dialog to the user
  const [hasInternet, setHasInternet] = useState(true);

  // Location permission modal state. Shown from the first render (also in
  // the server HTML), so nothing else can sit on top of it before it opens.
  const [showLocationModal, setShowLocationModal] = useState(true);

  const [locationPermissionStatus, setLocationPermissionStatus] = useState<
    "pending" | "granted" | "denied"
  >("pending");

  // NEW
  const [avatarConnection, setAvatarConnection] =
    useState<AvatarConnection>("disconnected");

  const [buttonMode, setButtonMode] = useState<MainButtonModes>("disconnected");
  const [circleMode, setCircleMode] = useState<CircleMode>("idle");

  const addEntry = useTranscriptStore((state) => state.addEntry);

  /**
   * monitor network availability
   */
  const isOnline = useNetworkStatus();
  useEffect(() => {
    setHasInternet(isOnline);
  }, [isOnline]);

  /**
   * poll for exipiration changes
   */
  useEffect(() => {
    const interval = setInterval(() => {
      console.log("check expiration");
      submit({ intent: "check-expiration" }, { method: "POST" });
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  // tracks the response time from the AI
  let responseTimeComparison: Date | null = null;

  /*
   * The activePlace in storage is sent to elevenlabs
   * the 11labs tool sends to to our agenent webhook
   * it can be used to change agent behavior
   * and to change business logic in the api.agent.webhook.server
   */
  const setActivePlace = usePlaceStore((state) => state.setActivePlace);

  useEffect(() => {
    if (place) setActivePlace(place);
  }, [place]);

  let activePlace = usePlaceStore((state) => state.activePlace);

  // audio cues: connect, disconnect, error, and a loop while the agent works on a reply
  const sounds = useSoundEffects();
  // an error is usually followed by a disconnect: play error.mp3 once, not off.mp3 too
  const errorAtRef = useRef(0);
  const recentError = () => Date.now() - errorAtRef.current < 3000;
  const playSound = sounds.play;
  const playError = useCallback(() => {
    if (Date.now() - errorAtRef.current >= 3000) playSound("error");
    errorAtRef.current = Date.now();
  }, [playSound]);

  /*
   * Sentry: who and where for every event from this session, and the first
   * step breadcrumb. Tags only (no email); see observability.client.ts.
   */
  useEffect(() => {
    setVisitorScope({
      userId: user_profile?.user_id ?? user.id,
      role: user.is_anonymous ? "guest" : "user",
      place: place ?? null,
      promo: access?.promo_code ?? null,
      agentId: elevenLabsId,
      access: access?.category ?? null,
      locale,
      startLanguage: startLanguage ?? null,
    });
    step("page shown", { place, greeting: shouldPlayGreeting });
    // once per page load; place changes are tagged below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPlaceTag(activePlace);
  }, [activePlace]);

  // when Start was pressed / the conversation connected, for step timings
  const connectStartRef = useRef<number | null>(null);
  const connectedAtRef = useRef<number | null>(null);
  const messageCountRef = useRef(0);
  // ElevenLabs conversation id of the live session, for the logged steps
  const conversationIdRef = useRef<string | null>(null);
  // pending switch back to "listening" after the agent stops speaking
  const listeningTimerRef = useRef<ReturnType<typeof setTimeout>>();
  // mic level and speech detection per session, logged on disconnect
  const speech = useSpeechStats();
  // the SDK callbacks below read the latest conversation through this
  const conversationRef = useRef<ReturnType<typeof useConversation>>();

  const conversation = useConversation({
    onConnect: ({ conversationId }) => {
      sounds.play("on");
      connectedAtRef.current = Date.now();
      messageCountRef.current = 0;
      setConversationTag(conversationId);
      conversationIdRef.current = conversationId;
      speech.start(
        () => conversationRef.current?.getInputVolume() ?? NaN,
        () => conversationRef.current?.isSpeaking ?? false,
      );
      step("conversation connected", {
        conversation_id: conversationId,
        connect_ms: connectStartRef.current
          ? Date.now() - connectStartRef.current
          : null,
      });
      // logged here, not after startSession(): with SDK 1.x it returns
      // nothing, and only sessions that actually connected should count
      logAppEventFromClient({
        event_type: "conversation_started",
        event_message: "New Conversation",
        event_details: { user_id: user_profile.user_id },
      });
      setButtonMode("listening");
      setCircleMode("preconnect");
      setTimeout(() => {
        setCircleMode("connected");
      }, 250); // matches preconnect transition duration
    },
    onDisconnect: (details) => {
      if (recentError()) sounds.stopProcessing();
      else sounds.play("off");
      step(
        "conversation disconnected",
        {
          // user = the visitor (or the app) ended it; agent = ElevenLabs
          // closed it; error = the connection failed
          reason: details.reason,
          ...(details.reason === "error" && { message: details.message }),
          ...(details.reason === "agent" && {
            close_code: details.context?.code,
          }),
          conversation_id: conversationIdRef.current,
          duration_ms: connectedAtRef.current
            ? Date.now() - connectedAtRef.current
            : null,
          messages: messageCountRef.current,
          // user_transcripts, mic_*, vad_*, first_speech_ms
          ...speech.stop(),
        },
        details.reason === "error" ? "warning" : "info",
      );
      connectedAtRef.current = null;
      conversationIdRef.current = null;
      clearTimeout(listeningTimerRef.current);
      setConversationTag(null);
      setCircleMode("idle");
      setButtonMode("disconnected");
    },

    onMessage: (message) => {
      messageCountRef.current += 1;
      const now = new Date();
      let responseTime;
      // the transcript store and event_log keep the old "user" / "ai" names
      const speaker = message.role === "user" ? "user" : "ai";
      if (speaker === "user") {
        responseTimeComparison = now;
        sounds.startProcessing();
        speech.userTranscript();
      }
      if (speaker === "ai") {
        sounds.stopProcessing();
        // set the response time
        responseTime = responseTimeComparison
          ? now.getTime() - responseTimeComparison.getTime()
          : undefined;

        responseTimeComparison = null;
      }

      logAppEventFromClient({
        event_type: speaker === "user" ? "user_spoke" : "agent_spoke",
        event_message: message.message,
        event_details: { user_id: user_profile.user_id },
      });

      addEntry(
        {
          timestamp: new Date(),
          text: message.message,
          speaker,
          location: coords ?? undefined,
          ...(responseTime !== undefined && { response_time: responseTime }),
        },
        user?.id,
      );
    },
    onModeChange: (modeObj) => {
      clearTimeout(listeningTimerRef.current);
      if (modeObj.mode === "speaking") {
        sounds.stopProcessing();
        setCircleMode("speaking");
        setButtonMode("speaking");
        return;
      }
      // over WebRTC the SDK takes the mode from LiveKit's active speaker, so
      // it reports "listening" in every pause between sentences: only switch
      // once the agent has stayed quiet, or the button and circles flicker
      listeningTimerRef.current = setTimeout(() => {
        setCircleMode("connected");
        setButtonMode("listening");
      }, AGENT_PAUSE_MS);
    },
    // only sent when the agent lists vad_score in its client_events
    onVadScore: ({ vadScore }) => speech.vad(vadScore),
    onError: (error: string) => {
      // SDK 1.x reports a failed start here (startSession() no longer
      // throws): before the session connected, it's a start failure
      if (connectedAtRef.current === null) {
        step("conversation start failed", { error }, "error");
        Sentry.captureMessage(`app view : start failed: ${error}`, "error");
        playError();
        setError("Couldn't start the conversation");
        return;
      }
      Sentry.captureMessage(error, "error");
      playError();
      setError(error);
    },
  });
  conversationRef.current = conversation;

  const startConversation = useCallback(async () => {
    const freshCoords = await getFreshLocation(coords);
    setCoords(freshCoords);
    rememberLocation(freshCoords);
    const user_lat = freshCoords?.lat ?? 0;
    const user_long = freshCoords?.long ?? 0;
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
      step("conversation connecting", {
        agent: elevenLabsId,
        place: activePlace,
        start_language: startLanguage ?? null,
      });
      // returns right away; connection, failure and the rest arrive through
      // the callbacks above (onConnect / onError / onDisconnect)
      conversation.startSession({
        agentId: elevenLabsId,
        connectionType: "webrtc",
        dynamicVariables: {
          user_lat,
          user_long,
          user_id: user_profile?.user_id ?? user.id,
          user_session,
          conversation_id,
          place: activePlace,
        },
        // venue's language (from the loader) as the first guess; the agent
        // switches to whatever language the visitor actually speaks
        ...(startLanguage && {
          overrides: { agent: { language: startLanguage } },
        }),
      });
    } catch (error) {
      step(
        "conversation start failed",
        { error: error instanceof Error ? error.message : String(error) },
        "error",
      );
      if (error instanceof Error) {
        Sentry.captureException(error);
      } else {
        Sentry.captureException(
          new Error(
            `app view : startConversation failed: ${JSON.stringify(error)}`,
          ),
        );
      }
      playError();
      setError("Couldn't start the conversation");
    }
  }, [conversation, user, coords, elevenLabsId, startLanguage, playError]);

  const stopConversation = useCallback(() => {
    logAppEventFromClient({
      event_type: "conversation_ended",
      event_message: "Conversation Ended",
      event_details: { user_id: user_profile.user_id },
    });
    // SDK 1.x also ends a session that is still connecting
    conversation.endSession();
  }, [conversation]);

  const handleMainButtonPress = () => {
    if (avatarConnection === "disconnected" || avatarConnection === "error") {
      // stop the greeting right away if it is playing
      stopGreeting();
      // unlock audio inside the tap (required on iOS) and load the files
      sounds.prepare();

      connectStartRef.current = Date.now();
      step("start pressed", { greeting_started: greetingStarted });
      startConversation();
      trackEvent({
        action: "user-conversation-started",
        category: "conversation",
        label: "press to connect",
      });
      // if the access doesn't have an expiration, set it
      if (!access?.expiration && access?.access_id) {
        const formData = new FormData();
        formData.append("intent", "set-expiration");
        formData.append("access_id", access.access_id);
        submit(formData, { method: "post" });
      }
    } else {
      trackEvent({
        action: "user-conversation-ended",
        category: "conversation",
        label: "press to disconnect",
      });
      sounds.stopProcessing();
      step("stop pressed", {
        // what the visitor saw when they tapped (connecting / listening /
        // speaking), and whether the agent's audio was actually playing
        button_mode: buttonMode,
        agent_speaking: conversation.isSpeaking,
        conversation_id: conversationIdRef.current,
        duration_ms: connectedAtRef.current
          ? Date.now() - connectedAtRef.current
          : null,
        messages: messageCountRef.current,
      });
      stopConversation();
      if (access?.expiration && new Date(access?.expiration) > new Date()) {
        console.log("expired! revalidate ", access);
        revalidator.revalidate();
      }
    }
  };

  const requestMicAccess = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicAllowed(true);
      step("mic allowed");
      //stream.getTracks().forEach((track) => track.stop());
    } catch (err) {
      step(
        "mic denied",
        {
          error:
            err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        },
        "warning",
      );
      if (err instanceof Error) {
        Sentry.captureException(err);
      } else {
        Sentry.captureException(
          new Error(`requestMicAccess failed: ${JSON.stringify(err)}`),
        );
      }
      setMicAllowed(false);
    }
  };

  const requestLocationPermission = async () => {
    // the modal's tap is the user gesture browsers need before playing audio;
    // start the greeting before awaiting anything so the gesture still counts
    if (shouldPlayGreeting) startGreeting();
    const { coords, status } = await requestInitialLocation();
    // "denied" here also covers a phone that refused or timed out
    step(status === "granted" ? "location allowed" : "location denied");
    setCoords(coords);
    rememberLocation(coords);
    setLocationPermissionStatus(status);
    setShowLocationModal(false);
  };

  const handleLocationModalClose = () => {
    step("location dismissed");
    if (shouldPlayGreeting) startGreeting();
    setShowLocationModal(false);
    if (locationPermissionStatus === "pending") {
      const { coords, status } = resolvePendingPermission();
      setCoords(coords);
      setLocationPermissionStatus(status);
    }
  };

  useEffect(() => {
    setAvatarConnection(conversation.status);
  }, [conversation.status]);

  useEffect(() => {
    if (avatarConnection === "connecting") {
      // CONNECTING
      setCircleMode("processing");
      setButtonMode("connecting");
    }
    // a failed start never connects, so onDisconnect doesn't reset the UI
    if (avatarConnection === "error") {
      setCircleMode("idle");
      setButtonMode("disconnected");
    }
  }, [avatarConnection]);

  /*
   * greeting logic
   */
  type AudioPlayerHandle = {
    stop: () => void;
    play: () => void;
  };
  const audioRef = useRef<AudioPlayerHandle>(null);

  // once started (from the location modal or the tap-anywhere overlay), the
  // overlay goes away so it can't swallow the next tap (e.g. on Start)
  const [greetingStarted, setGreetingStarted] = useState(false);

  // stable, or AudioPlayer rebuilds its <audio> on every render and cuts the
  // greeting off mid-play
  const greetingSrc = `https://d18wgkub2vz70r.cloudfront.net/greetings/${activePlace}-${locale}.mp3`;
  // without the primary src or duplicates: for English visitors the
  // default-language file IS the primary, and retrying it just fails again
  const greetingFallbacks = useMemo(
    () =>
      [
        ...new Set([
          `https://d18wgkub2vz70r.cloudfront.net/greetings/${activePlace}-${DEFAULT_LOCALE}.mp3`,
          "/audio/greetings/wonderway.mp3",
        ]),
      ].filter((url) => url !== greetingSrc),
    [activePlace, greetingSrc],
  );

  const handleGreetingEnded = () => {
    step("greeting finished");
    setCircleMode("idle");
    submit({ intent: "greeted", user_id: user.id }, { method: "post" });
  };

  const startGreeting = () => {
    setGreetingStarted(true);
    audioRef.current?.play();
  };

  const stopGreeting = () => {
    audioRef.current?.stop();
  };

  const buttonLabel = shouldPlayGreeting
    ? t("global.start_btn")
    : t("global.talk_btn");

  // text feedback on the agent's state, shown at the top of the screen
  const stateText: Record<MainButtonModes, string> = {
    // names the button, since this text sits at the top of the screen;
    // "begin" when the button itself says Start ("Tap Start to begin")
    disconnected: t(
      shouldPlayGreeting ? "main_button.tap_start" : "main_button.tap_talk",
      { label: buttonLabel },
    ),
    listening: t("main_button.listening"),
    speaking: t("main_button.speaking"),
    connecting: t("main_button.connecting"),
  };
  // thinking (in step with the circles and the processing sound) shows over
  // the listening text, between the visitor's question and the reply
  const currentStateText =
    sounds.thinking && buttonMode === "listening"
      ? t("main_button.thinking")
      : stateText[buttonMode];
  const showStateText =
    access?.category !== "unused" && access?.category !== "expired";

  return (
    <>
      {/* in flow at the start of <main>, so it sits right under the nav;
          above the full-screen circles layer (z-30) */}
      {showStateText && (
        <p className="relative z-40 w-full pt-2 text-center pointer-events-none font-bold">
          {currentStateText}
        </p>
      )}

      {shouldPlayGreeting && (
        <>
          {/* tap-anywhere fallback, never on top of the location modal: it
              used to swallow the first tap on "Allow" (MIT QA, Nov 2026) */}
          {!showLocationModal && !greetingStarted && (
            <GreetingButton onPress={startGreeting}></GreetingButton>
          )}
          <AudioPlayer
            ref={audioRef}
            src={greetingSrc}
            fallbackSrc={greetingFallbacks}
            onStart={() => {
              step("greeting started", { src: greetingSrc });
              setCircleMode("speaking");
            }}
            onEnded={() => handleGreetingEnded()}
            onFailed={(lastSrc) =>
              step("greeting failed", { last_src: lastSrc }, "warning")
            }
          />
        </>
      )}
      <div className="fixed w-dvw h-dvh top-0 left-0 pointer-events-none pt-14 z-30">
        {/* thinking (in step with the processing sound) shows over the
            listening state, between the visitor's question and the reply */}
        <Circles
          key="avatar-circle"
          mode={
            sounds.thinking && circleMode === "connected"
              ? "processing"
              : circleMode
          }
        ></Circles>
      </div>

      {error && (
        <div className="mt-3">
          <EBMMessage variant="error" message={error} />
        </div>
      )}

      {!hasInternet && <OfflineDialog />}

      {/* Location Permission Modal */}
      {showLocationModal && (
        <LocationModal
          onAllow={requestLocationPermission}
          onClose={handleLocationModalClose}
        />
      )}

      {access?.category === "unused" && (
        <div className="bg-black rounded-t-2xl w-[240px] h-[200px] fixed bottom-0 left-1/2 -translate-x-1/2 text-white flex flex-col gap-1 items-center justify-center">
          <p className="font-bold pt-[132px]">Welcome</p>
          <p>
            {access.hours <= 24
              ? `${access.hours} ${access.hours === 1 ? "hour" : "hours"}`
              : `${Math.ceil(access.hours / 24)} ${Math.ceil(access.hours / 24) === 1 ? "day" : "days"}`}{" "}
            access
          </p>
        </div>
      )}

      {access?.category !== "expired" ? (
        <>
          <MainButton
            className="fixed left-1/2 -translate-x-1/2 bottom-16 z-30"
            onPress={handleMainButtonPress}
            mode={buttonMode}
            userAccess={access?.category ?? "none"}
            expiration={access?.expiration ?? new Date().toISOString()}
            label={buttonLabel}
          ></MainButton>
        </>
      ) : (
        <>
          <PurchaseButton
            className="fixed left-1/2 -translate-x-1/2 bottom-16 z-10"
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
          <span className="fixed left-1/2 -translate-x-1/2 bottom-2 z-10 text-center text-sm">
            <span className="font-bold">$5</span> Day Pass{"  "}
            <br />
            <span className="font-bold">$15</span> Week Pass <br /> No
            subscription
          </span>
        </>
      )}
    </>
  );
};

/*
 * SDK 1.x keeps the session in a provider. It ends the session on unmount,
 * including one still connecting (0.6 left those running).
 */
const AppView: React.FC = () => (
  <ConversationProvider>
    <ParentComponent />
  </ConversationProvider>
);

export default AppView;
