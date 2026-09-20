// hooks/useAgentContext.ts
// allows the Agent component to access loader data from the current route.
import { useMatches } from "react-router";

export type AgentContext = {
  elevenLabsId: string;
  place: string | null;
};

function hasAgentContext(
  data: unknown,
): data is { agentContext: AgentContext } {
  return (
    typeof data === "object" &&
    data !== null &&
    "agentContext" in data &&
    typeof (data as { agentContext?: unknown }).agentContext === "object" &&
    (data as { agentContext: unknown }).agentContext !== null
  );
}

export function useAgentContext(): AgentContext | undefined {
  const matches = useMatches();

  // search from the leaf route backward to the root, so the most
  // specific route's agentContext wins if more than one route has one
  for (let i = matches.length - 1; i >= 0; i--) {
    const data = matches[i].data;
    if (hasAgentContext(data)) {
      return data.agentContext;
    }
  }

  return undefined;
}
