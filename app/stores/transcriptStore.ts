import { create } from "zustand";

type TranscriptEntry = {
  timestamp: Date;
  text: string;
  speaker: "user" | "ai";
};

type TranscriptStore = {
  transcript: TranscriptEntry[];
  addEntry: (entry: TranscriptEntry) => void;
  clearTranscript: () => void;
};

export const useTranscriptStore = create<TranscriptStore>((set) => ({
  transcript: [],
  addEntry: (entry) =>
    set((state) => ({
      transcript: [...state.transcript, entry],
    })),
  clearTranscript: () => set({ transcript: [] }),
}));
