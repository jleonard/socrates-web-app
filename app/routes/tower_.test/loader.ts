// src/routes/test-transcription/loader.ts
import type { LoaderFunction } from "react-router";

export const loader: LoaderFunction = async () => {
  // Return empty initial state
  return { corrected: "" };
};
