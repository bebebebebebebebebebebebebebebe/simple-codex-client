import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
} from "@assistant-ui/react";
import type { ReactNode } from "react";

const codexAdapter: ChatModelAdapter = {
  async run({ messages, abortSignal }) {
    const lastMessage = messages.at(-1);
    const text =
      lastMessage?.content
        .filter(p => p.type === "text")
        .map(p => (p as { type: "text"; text: string }).text)
        .join("") ?? "";

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
      signal: abortSignal,
    });
    const data = await res.json<{ reply: string }>();
    return { content: [{ type: "text", text: data.reply }] };
  },
};

export function MyRuntimeProvider({ children }: { children: ReactNode }) {
  const runtime = useLocalRuntime(codexAdapter);
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
