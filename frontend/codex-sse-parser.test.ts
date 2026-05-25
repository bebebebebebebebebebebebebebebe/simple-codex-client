import { describe, expect, test } from "bun:test";
import { parseCodexSseChunk } from "./codex-sse-parser";

describe("parseCodexSseChunk", () => {
  test("parses multiple complete events in one chunk", () => {
    const parsed = parseCodexSseChunk(
      "",
      [
        'event: message.delta\ndata: {"type":"message.delta","turnId":"t","itemId":"i","text":"a"}',
        'event: turn.completed\ndata: {"type":"turn.completed","turnId":"t","status":"completed"}',
        "",
      ].join("\n\n"),
    );

    expect(parsed.buffer).toBe("");
    expect(parsed.events).toEqual([
      {
        type: "message.delta",
        turnId: "t",
        itemId: "i",
        text: "a",
      },
      {
        type: "turn.completed",
        turnId: "t",
        status: "completed",
      },
    ]);
  });

  test("keeps partial event text in the buffer until the next chunk", () => {
    const first = parseCodexSseChunk(
      "",
      'event: reasoning.delta\ndata: {"type":"reasoning.delta","turnId":"t"',
    );
    const second = parseCodexSseChunk(
      first.buffer,
      ',"itemId":"r","summaryIndex":0,"text":"x"}\n\n',
    );

    expect(first.events).toEqual([]);
    expect(second.buffer).toBe("");
    expect(second.events).toEqual([
      {
        type: "reasoning.delta",
        turnId: "t",
        itemId: "r",
        summaryIndex: 0,
        text: "x",
      },
    ]);
  });

  test("ignores empty event blocks and supports CRLF input", () => {
    const parsed = parseCodexSseChunk(
      "",
      '\r\nevent: tool.output.delta\r\ndata: {"type":"tool.output.delta","turnId":"t","itemId":"tool","text":"ok"}\r\n\r\n',
    );

    expect(parsed.events).toEqual([
      {
        type: "tool.output.delta",
        turnId: "t",
        itemId: "tool",
        text: "ok",
      },
    ]);
  });
});
