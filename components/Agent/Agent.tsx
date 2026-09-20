import { useConversation } from "@elevenlabs/react";
import type { CircleMode } from "components/Circles/Circles.types";
import { MiniCircles } from "components/Circles/MiniCircles";
import { useState } from "react";
import { useAgentContext } from "~/hooks/useAgentContext";

type AgentProps = {
  className?: string;
};

const modes: CircleMode[] = [
  "speaking",
  "connected",
  "processing",
  "idle",
  "error",
  "preconnect",
];

export function Agent({ className }: AgentProps) {
  const [mode, setMode] = useState<CircleMode>("idle");
  const agentContext = useAgentContext();

  const handleClick = () => {
    const randomMode = modes[Math.floor(Math.random() * modes.length)];
    setMode(randomMode);
  };

  return (
    <div className={className} onClick={handleClick}>
      <MiniCircles mode={mode} />
    </div>
  );
}

export default Agent;
