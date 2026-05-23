import { describe, expect, test } from "bun:test";
import { ProcessJsonlTransport } from "./process-jsonl-transport";

describe("ProcessJsonlTransport", () => {
  test("listener exceptions are not reported as JSON parse failures", async () => {
    const transport = new ProcessJsonlTransport({
      command: "bun",
      args: [
        "-e",
        "console.log(JSON.stringify({ id: 1, result: 2 })); setTimeout(() => {}, 50);",
      ],
    });
    const errors: unknown[] = [];

    transport.onError((error) => errors.push(error));
    transport.onMessage(() => {
      throw new Error("listener boom");
    });

    await transport.start();
    await waitFor(() => errors.length > 0);
    await transport.stop();

    expect(String(errors[0])).toContain("listener boom");
    expect(String(errors[0])).not.toContain("failed to parse");
  });
});

const waitFor = async (predicate: () => boolean): Promise<void> => {
  const started = Date.now();

  while (!predicate()) {
    if (Date.now() - started > 1_000) {
      throw new Error("timed out waiting for predicate");
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};
