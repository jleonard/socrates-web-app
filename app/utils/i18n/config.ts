export const SUPPORTED_LOCALES = ["en", "es"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "en";
export const DEFAULT_NS = "translation";

type TtsLanguageConfig = {
  elevenlabsVoiceId: string;
  prompt: string;
};

export const ttsLanguages: Record<SupportedLocale, TtsLanguageConfig> = {
  en: {
    elevenlabsVoiceId: "FUfBrNit0NNZAwb58KWH", // Angela
    prompt: "",
  },
  es: {
    elevenlabsVoiceId: "b2htR0pMe28pYwCY9gnP", // Sofia - Columbian
    prompt: "neutral Latin American Spanish",
  },
};
