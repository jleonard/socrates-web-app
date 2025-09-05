// store/sessionStore.ts
import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";

type SessionState = {
  sessionId: string;
  createdAt: number;
  refreshSession: () => void;
};

export const useSessionStore = create<SessionState>((set, get) => ({
  sessionId: "",
  createdAt: 0,
  refreshSession: () => {
    const newId = uuidv4();
    set({ sessionId: newId, createdAt: Date.now() });
    // also persist to localStorage so it survives reloads
    localStorage.setItem(
      "sessionData",
      JSON.stringify({ sessionId: newId, createdAt: Date.now() })
    );
  },
}));

// Restore session on load
const saved = localStorage.getItem("sessionData");
if (saved) {
  const { sessionId, createdAt } = JSON.parse(saved);
  if (Date.now() - createdAt < 48 * 60 * 60 * 1000) {
    // sessions are 48 hours
    useSessionStore.setState({ sessionId, createdAt });
  } else {
    useSessionStore.getState().refreshSession();
  }
} else {
  useSessionStore.getState().refreshSession();
}
