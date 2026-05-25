import type { CodexUiEvent } from "../codex/ui-events";

/**
 * SSE stream の途中 buffer と新規 chunk から、完結した Codex UI event を取り出す。
 *
 * @param buffer - 前回 chunk で完結しなかった SSE 文字列。
 * @param chunk - 新しく decode された SSE 文字列。
 * @returns 完結した events と、次回へ持ち越す buffer。
 */
export function parseCodexSseChunk(
  buffer: string,
  chunk: string,
): { buffer: string; events: CodexUiEvent[] } {
  const normalized = (buffer + chunk).replaceAll("\r\n", "\n");
  const eventTexts = normalized.split("\n\n");
  const nextBuffer = eventTexts.pop() ?? "";
  const events = eventTexts.flatMap((eventText) => {
    const data = eventText
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => {
        return line.startsWith("data: ") ? line.slice(6) : line.slice(5);
      })
      .join("\n");

    if (!data) return [];

    return [JSON.parse(data) as CodexUiEvent];
  });

  return {
    buffer: nextBuffer,
    events,
  };
}
