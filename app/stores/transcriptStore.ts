import { create } from "zustand";

type TranscriptEntry = {
  timestamp: Date;
  text: string;
  speaker: "user" | "ai";
  location?: {
    lat: number;
    long: number;
    place?: {
      name: string;
      type: 'cultural' | 'neighborhood' | 'city';
    };
  };
  response_time?: number;
};

type TranscriptStore = {
  transcript: TranscriptEntry[];
  addEntry: (entry: TranscriptEntry, userId?: string) => void;
  clearTranscript: () => void;
};

export const useTranscriptStore = create<TranscriptStore>((set) => ({
  transcript: [],
  addEntry: (entry, userId) => {
    set((state) => ({
      transcript: [...state.transcript, entry],
    }));

    // Guardar en n8n si hay userId
    if (userId) {
      // Verificar condiciones para Google Places
      const isUser = entry.speaker === "user";
      const hasLocation = entry.location && entry.location.lat && entry.location.long;
      const latNotZero = entry.location?.lat !== 0;
      const longNotZero = entry.location?.long !== 0;

      if (isUser && hasLocation && latNotZero && longNotZero ) {
        // Llamar al endpoint de Google Places
        fetch("/api/places", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lat: entry.location?.lat,
            lng: entry.location?.long
          })
        })
        .then(response => response.json())
        .then(data => {
          if (data.placeInfo) {
            // Crear mensaje con información del lugar
            const messageWithPlace = {
              type: "human",
              content: entry.text,
              timestamp: entry.timestamp.toISOString(),
              additional_kwargs: {},
              response_metadata: entry.response_time
                ? { response_time: entry.response_time }
                : {},
              location: {
                lat: entry.location?.lat,
                long: entry.location?.long,
                place: data.placeInfo
              }
            };
            
            // Enviar a n8n con información del lugar
            fetch(
              "https://leonardalonso.app.n8n.cloud/webhook/3337cc34-c558-4355-86f3-b4d52cfc670b",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  session: userId,
                  message: messageWithPlace,
                }),
              }
            ).catch((e) => {
              console.error("Error enviando transcripción con lugar a n8n:", e);
            });
          } else {
            // Si no se encontró lugar, enviar sin lugar
            const messageWithoutPlace = {
              type: "human",
              content: entry.text,
              timestamp: entry.timestamp.toISOString(),
              additional_kwargs: {},
              response_metadata: entry.response_time
                ? { response_time: entry.response_time }
                : {},
              location: {
                lat: entry.location?.lat,
                long: entry.location?.long
              }
            };
            
            fetch(
              "https://leonardalonso.app.n8n.cloud/webhook/3337cc34-c558-4355-86f3-b4d52cfc670b",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  session: userId,
                  message: messageWithoutPlace,
                }),
              }
            ).catch((e) => {
              console.error("Error enviando transcripción sin lugar a n8n:", e);
            });
          }
        })
        .catch(() => {
          // En caso de error, enviar sin lugar
          const messageWithoutPlace = {
            type: "human",
            content: entry.text,
            timestamp: entry.timestamp.toISOString(),
            additional_kwargs: {},
            response_metadata: entry.response_time
              ? { response_time: entry.response_time }
              : {},
            location: {
              lat: entry.location?.lat,
              long: entry.location?.long
            }
          };

          fetch(
            "https://leonardalonso.app.n8n.cloud/webhook/3337cc34-c558-4355-86f3-b4d52cfc670b",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                session: userId,
                message: messageWithoutPlace,
              }),
            }
          ).catch((e) => {
            console.error("Error enviando transcripción (error) a n8n:", e);
          });
        });
      } else {
        // Para AI o sin ubicación, enviar inmediatamente
        const message = {
          type: entry.speaker === "user" ? "human" : "ai",
          content: entry.text,
          timestamp: entry.timestamp.toISOString(),
          additional_kwargs: {},
          response_metadata: entry.response_time
            ? { response_time: entry.response_time }
            : {},
          // Solo incluir location para mensajes del usuario
          ...(entry.speaker === "user" && { location: entry?.location ?? { lat: 0, long: 0 } }),
        };
        
        fetch(
          "https://leonardalonso.app.n8n.cloud/webhook/3337cc34-c558-4355-86f3-b4d52cfc670b",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              session: userId,
              message,
            }),
          }
        ).catch((e) => {
          console.error("Error enviando transcripción a n8n:", e);
        });
      }
    }
  },
  clearTranscript: () => set({ transcript: [] }),
}));
