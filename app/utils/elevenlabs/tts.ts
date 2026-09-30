export async function textToSpeech(
  text: string,
  voiceId: string,
): Promise<Buffer> {
  let response: Response;

  try {
    response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_TTS_KEY!,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
        }),
      },
    );
  } catch (error) {
    console.error(`[textToSpeech] ElevenLabs request failed`, error);

    throw new Error(`ElevenLabs TTS request failed`, {
      cause: error,
    });
  }

  if (!response.ok) {
    const errorText = await response.text();

    console.error(
      `[textToSpeech] ElevenLabs returned ${response.status}: ${errorText}`,
    );

    throw new Error(`ElevenLabs TTS failed (${response.status}): ${errorText}`);
  }

  let audioBuffer: Buffer;

  try {
    audioBuffer = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.error(`[textToSpeech] Failed to read ElevenLabs audio`, error);

    throw new Error(`[textToSpeech] Failed to read ElevenLabs audio`, {
      cause: error,
    });
  }

  return audioBuffer;
}
