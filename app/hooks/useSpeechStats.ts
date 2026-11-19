import { useCallback, useEffect, useRef } from "react";

/*
 * Per-session speech stats, logged with "conversation disconnected", to tell
 * apart why a session has no transcript:
 *   mic quiet,  no VAD speech -> the visitor said nothing
 *   mic loud,   no VAD speech -> noise, but no speech reached the agent
 *   VAD speech, no transcript -> they spoke and weren't heard
 *   mic_peak 0                -> the mic isn't working
 *
 * Mic level: the SDK's getInputVolume() (its own mic analyser), sampled while
 * the agent isn't speaking, so its playback leaking into the mic doesn't count.
 * VAD: ElevenLabs' vad_score events, which only arrive when the agent lists
 * `vad_score` in its client_events; without them the vad_* fields are null.
 */

const SAMPLE_MS = 100;
/** getInputVolume() level (0–1) counted as loud. It's the mean of the
 * analyser's dB-scaled frequency bins, so even a quiet room reads above 0.
 * A first guess: tune it against logged mic_peak / mic_avg values. */
const MIC_LOUD = 0.2;
/** ElevenLabs VAD score counted as speech. */
const VAD_SPEECH = 0.5;
/** Longest gap between VAD events still counted as continuous speech. */
const VAD_MAX_GAP_MS = 500;

type Stats = {
  startedAt: number;
  micSamples: number;
  micSum: number;
  micPeak: number;
  micLoudMs: number;
  vadEvents: number;
  vadPeak: number;
  vadSpeechMs: number;
  lastVadAt: number | null;
  firstSpeechMs: number | null;
  userTranscripts: number;
};

const fresh = (): Stats => ({
  startedAt: Date.now(),
  micSamples: 0,
  micSum: 0,
  micPeak: 0,
  micLoudMs: 0,
  vadEvents: 0,
  vadPeak: 0,
  vadSpeechMs: 0,
  lastVadAt: null,
  firstSpeechMs: null,
  userTranscripts: 0,
});

const round = (n: number) => Math.round(n * 1000) / 1000;

export type SpeechSummary = {
  user_transcripts: number;
  mic_peak: number | null;
  mic_avg: number | null;
  mic_loud_ms: number;
  vad_peak: number | null;
  vad_speech_ms: number | null;
  first_speech_ms: number | null;
};

export function useSpeechStats() {
  const statsRef = useRef<Stats>(fresh());
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  /** Call when the session connects. */
  const start = useCallback(
    (getInputVolume: () => number, agentSpeaking: () => boolean) => {
      clearInterval(timerRef.current);
      statsRef.current = fresh();
      timerRef.current = setInterval(() => {
        if (agentSpeaking()) return;
        const level = getInputVolume();
        if (!Number.isFinite(level)) return;
        const s = statsRef.current;
        s.micSamples += 1;
        s.micSum += level;
        s.micPeak = Math.max(s.micPeak, level);
        if (level >= MIC_LOUD) s.micLoudMs += SAMPLE_MS;
      }, SAMPLE_MS);
    },
    [],
  );

  /** Call from the SDK's onVadScore. */
  const vad = useCallback((score: number) => {
    const s = statsRef.current;
    const now = Date.now();
    s.vadEvents += 1;
    s.vadPeak = Math.max(s.vadPeak, score);
    if (score >= VAD_SPEECH) {
      if (s.lastVadAt !== null) {
        s.vadSpeechMs += Math.min(now - s.lastVadAt, VAD_MAX_GAP_MS);
      }
      s.firstSpeechMs ??= now - s.startedAt;
    }
    s.lastVadAt = now;
  }, []);

  /** Call for every visitor transcript. */
  const userTranscript = useCallback(() => {
    statsRef.current.userTranscripts += 1;
  }, []);

  /** Call when the session ends: stops sampling and returns the summary. */
  const stop = useCallback((): SpeechSummary => {
    clearInterval(timerRef.current);
    const s = statsRef.current;
    const hasMic = s.micSamples > 0;
    const hasVad = s.vadEvents > 0;
    return {
      user_transcripts: s.userTranscripts,
      mic_peak: hasMic ? round(s.micPeak) : null,
      mic_avg: hasMic ? round(s.micSum / s.micSamples) : null,
      mic_loud_ms: s.micLoudMs,
      vad_peak: hasVad ? round(s.vadPeak) : null,
      vad_speech_ms: hasVad ? s.vadSpeechMs : null,
      first_speech_ms: s.firstSpeechMs,
    };
  }, []);

  useEffect(() => () => clearInterval(timerRef.current), []);

  return { start, vad, userTranscript, stop };
}
