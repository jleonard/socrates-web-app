import { useTranscriptStore } from "~/stores/transcriptStore";
import ChatMessage from "components/ChatMessage/ChatMessage";

export const Transcript = () => {
  const transcript = useTranscriptStore((state) => state.transcript);

  return (
    <div className="max-w-[700px]">
      <ul className="flex flex-col gap-5">
        {transcript.map((entry, index) => (
          <li key={index}>
            <ChatMessage
              text={entry.text}
              messageType={entry.speaker === "user" ? "outgoing" : "incoming"}
            />
          </li>
        ))}
      </ul>
    </div>
  );
};
