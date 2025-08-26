import React, { useEffect, useState, useCallback } from "react";
import type { loader } from "./loader";
import { useLoaderData, Link } from "@remix-run/react";
import { useConversation } from "@11labs/react";
import { MainButton } from "components/MainButton/MainButton";
import { useTranscriptStore } from "../../stores/transcriptStore";
import { Circles } from "components/Circles/Circles";
import { trackEvent } from "~/utils/googleAnalytics";
import { useNetworkStatus } from "~/hooks/useNetworkStatus";
import { EBMMessage } from "components/EBMMessage/EBMMessage";
import LocationModal from "components/LocationModal/LocationModal";

// Conversation memory functions
async function getConversationHistory(userId: string) {
  try {
    const response = await fetch(
      `https://leonardalonso.app.n8n.cloud/webhook/f4140ee1-ae3d-487a-8487-028196f983b1?session=${encodeURIComponent(
        userId
      )}`
    );
    const history = await response.json();
    return Array.isArray(history) ? history : [];
  } catch (error) {
    console.error("Error fetching conversation history:", error);
    return [];
  }
}

function filterTodayMessages(messages: HistoryMessage[]) {
  const today = new Date().toDateString();
  return messages.filter((msg) => {
    if (!msg.message?.timestamp) return false;
    const msgDate = new Date(msg.message.timestamp).toDateString();
    return msgDate === today;
  });
}

type HistoryMessage = {
  message?: {
    timestamp: string;
    content: string;
    type: "human" | "ai";
  };
};

async function getContextForElevenLabs(userId: string, userName?: string) {
  const history = await getConversationHistory(userId);

  if (history.length === 0) {
    return {
      session_type: "new_user",
      greeting: "Hi there, I'm ayapi!.",
      conversation_history: null,
      context_message: null,
    };
  }

  // Ordenar por timestamp más reciente primero
  const sorted = [...history].sort((a, b) => {
    const aTime = new Date(a.message?.timestamp).getTime();
    const bTime = new Date(b.message?.timestamp).getTime();
    return bTime - aTime;
  });

  const lastMessage = sorted[0];
  const now = new Date();
  const lastMessageTime = new Date(lastMessage.message?.timestamp);
  const timeDiff = now.getTime() - lastMessageTime.getTime();

  const hours = timeDiff / (1000 * 60 * 60);
  const minutes = timeDiff / (1000 * 60);

  if (hours > 24) {
    // Más de 24 horas = nueva sesión, sin contexto
    return {
      session_type: "new_session",
      greeting: `Hi ${userName || "there"}!`,
      conversation_history: null,
      context_message: `••• CONTEXT UPDATE ••• This is a new conversation after 24+ hours. Please greet with "Hi ${
        userName || "there"
      }!" and start fresh with no previous context. ••• ACKNOWLEDGE SILENTLY •••`,
    };
  }

  if (minutes > 5) {
    // Mismo día, historial de hoy
    const todayHistory = filterTodayMessages(sorted);
    const historyText = todayHistory
      .slice(0, 10) // Últimos 10 mensajes del día
      .map(
        (item) =>
          `${item.message?.type === "human" ? "User" : "Ayapi"}: ${
            item.message?.content
          }`
      )
      .join("\n");

    return {
      session_type: "same_day",
      greeting: "Hi there",
      conversation_history: historyText,
      context_message: `••• CONTEXT UPDATE ••• Today's conversation history:\n${historyText}\n\nPlease greet with "Hi there" and be aware of our previous discussion today. ••• ACKNOWLEDGE SILENTLY •••`,
    };
  }

  // Menos de 5 minutos = continuar donde estaba
  const recentHistory = sorted.slice(0, 6); // Últimos 6 mensajes
  const recentText = recentHistory
    .map(
      (item) =>
        `${item.message?.type === "human" ? "User" : "Ayapi"}: ${
          item.message?.content
        }`
    )
    .join("\n");

  // Analizar el último intercambio para generar continuación específica
  const lastUserMessage = recentHistory.find(
    (msg) => msg.message?.type === "human"
  );
  const lastAyapiMessage = recentHistory.find(
    (msg) => msg.message?.type === "ai"
  );

  let continuationContext = "";
  if (lastUserMessage?.message?.content) {
    const lastUserText = lastUserMessage.message.content;

    // Si el usuario hizo una pregunta
    if (
      lastUserText.includes("?") ||
      lastUserText.toLowerCase().includes("what") ||
      lastUserText.toLowerCase().includes("how") ||
      lastUserText.toLowerCase().includes("where") ||
      lastUserText.toLowerCase().includes("why") ||
      lastUserText.toLowerCase().includes("who")
    ) {
      continuationContext = `The user was asking: "${lastUserText}". Continue answering this question directly.`;
    }
    // Si estaban discutiendo algo específico
    else if (lastAyapiMessage?.message?.content) {
      continuationContext = `We were discussing something. The user said: "${lastUserText}". I was responding about this topic. Continue the conversation naturally from here.`;
    }
    // Fallback general
    else {
      continuationContext = `The user's last comment was: "${lastUserText}". Pick up the conversation naturally from this point.`;
    }
  } else {
    continuationContext =
      "Continue the conversation where we left off naturally.";
  }

  return {
    session_type: "reconnection",
    greeting: "I'm back, do you want to continue where we left off?",
    conversation_history: recentText,
    context_message: `••• CONTEXT UPDATE ••• We were just talking and got disconnected. Recent conversation:\n${recentText}\n\n${continuationContext}\n\n If the useres say that he/she wants to continue the conversation, then continue the conversation. Don't wait for the user to repeat themselves. Reference the context directly like "You were asking about [X]" or respond to unfinished topics. If the user says that he/she doesn't want to continue the conversation, then say "okay, let's talk about something else". ••• ACKNOWLEDGE SILENTLY •••`,
  };
}

const ParentComponent: React.FC = () => {
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

  // current place information (cached to avoid repeated API calls)
  const [currentPlace, setCurrentPlace] = useState<string>("Unknown location");

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

  // this is used to render the spinner in the main button when elevenlabs is connecting.
  const [avatarConnecting, setConnectingState] = useState(false);

  const { elevenLabsId, user } = useLoaderData<typeof loader>();

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
    const user_session = user.id;
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
        dynamicVariables: {
          user_lat,
          user_long,
          user_session,
          current_location: currentPlace,
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
  }, [conversation, user, coords, elevenLabsId, currentPlace]);

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

  // Effect to get place information when coordinates change (same logic as transcriptStore)
  useEffect(() => {
    // Verificar condiciones EXACTAMENTE como en transcriptStore
    const hasLocation = coords && coords.lat && coords.long;
    const latNotZero = coords?.lat !== 0;
    const longNotZero = coords?.long !== 0;

    if (hasLocation && latNotZero && longNotZero) {
      // Llamar al endpoint de Google Places (MISMA lógica que transcriptStore)
      fetch("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: coords.lat,
          lng: coords.long,
        }),
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.placeInfo) {
            // Usar EXACTAMENTE los mismos datos que transcriptStore
            // transcriptStore guarda todo el objeto data.placeInfo completo
            // Nosotros formatearemos el nombre basándose en el type como hacíamos antes
            const place = data.placeInfo;
            let placeName;

            if (place.type === "cultural") {
              placeName = place.name; // "Metropolitan Museum"
            } else if (place.type === "neighborhood") {
              placeName = `${place.name} neighborhood`; // "SoHo neighborhood"
            } else if (place.type === "city") {
              placeName = place.name; // "New York"
            } else {
              placeName = place.name;
            }

            setCurrentPlace(placeName);
          } else {
            // Si no se encontró lugar, usar ubicación genérica
            setCurrentPlace("Unknown location");
          }
        })
        .catch(() => {
          // En caso de error, usar ubicación genérica (como en transcriptStore)
          setCurrentPlace("Unknown location");
        });
    }
  }, [coords]);

  useEffect(() => {
    if (conversation.status === "connecting") {
      setAvatarState("idle");
      setConnectingState(true);
    } else {
      setConnectingState(false);
    }
    if (conversation.status === "connected") {
      setAvatarState("preconnect");
      setTimeout(() => {
        setAvatarState("connected"); // connected
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
  }, [conversation.isSpeaking, conversation.status]);

  return (
    <>
      <div className="fixed w-dvw h-dvh top-0 left-0 pointer-events-none">
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

      <MainButton
        className="fixed left-1/2 -translate-x-1/2 bottom-14 z-20"
        onPress={handleMainButtonPress}
        active={attentionConnected}
        loading={avatarConnecting}
      ></MainButton>

      <div className="fixed bottom-0 left-0 w-full items-center z-10">
        <span>x v1</span>
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
