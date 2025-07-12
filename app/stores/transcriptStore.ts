import { create } from "zustand";

type TranscriptEntry = {
  timestamp: Date;
  text: string;
  speaker: "user" | "ai";
  location?: {
    lat: number;
    long: number;
  };
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
      const message = {
        type: entry.speaker === "user" ? "human" : "ai",
        content: entry.text,
        timestamp: entry.timestamp.toISOString(),
        additional_kwargs: {},
        response_metadata: {},
        location: entry?.location ?? { lat: 0, long: 0 },
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
  },
  clearTranscript: () => set({ transcript: [] }),
}));
