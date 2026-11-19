export type AvatarMode = "none" | "speaking" | "listening";

/** The ElevenLabs SDK's conversation status ("error" after a failed start or
 * a dropped session, until the next start). */
export type AvatarConnection =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";
