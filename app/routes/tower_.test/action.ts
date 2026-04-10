// src/routes/test-transcription/action.ts
import type { ActionFunction } from "react-router";
import { correctTranscription } from "~/utils/query-correction.server";

type ActionData = {
  corrected?: string;
};

export const action: ActionFunction = async ({ request }) => {
  const formData = await request.formData();
  const query = formData.get("query")?.toString() || "";

  const { corrected, raw } = await correctTranscription(query);

  return { corrected, raw } as ActionData;
};
