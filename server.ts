import index from "./index.html";
import { spawn } from "node:child_process";
import readline from "node:readline";
import type { JsonRpcResponse } from "./json-rpc-schema";

// Build Tailwind CSS once on startup, then watch for changes
const tailwindArgs = [
  "x", "@tailwindcss/cli",
  "-i", "./styles.css",
  "-o", "./public/styles.css",
  "--watch",
];
const tailwindProcess = spawn("bun", tailwindArgs, {
  stdio: ["ignore", "pipe", "pipe"],
});
tailwindProcess.stdout.on("data", d => process.stdout.write(d));
tailwindProcess.stderr.on("data", d => process.stderr.write(d));

// Spawn mock server
const codexProcess = spawn("bun", ["run", "json-rpc-mock-server.ts"], {
  stdio: ["pipe", "pipe", "pipe"],
});

const pendingRequests = new Map<number, (res: JsonRpcResponse) => void>();
let requestId = 0;

readline.createInterface({ input: codexProcess.stdout }).on("line", line => {
  try {
    const res: JsonRpcResponse = JSON.parse(line);
    if (res.id != null) {
      pendingRequests.get(res.id as number)?.(res);
      pendingRequests.delete(res.id as number);
    }
  } catch {}
});

codexProcess.stderr.on("data", data => {
  process.stderr.write(`mock server: ${data}`);
});

function sendJsonRpc(method: string, params: unknown): Promise<JsonRpcResponse> {
  return new Promise(resolve => {
    const id = ++requestId;
    pendingRequests.set(id, resolve);
    codexProcess.stdin.write(JSON.stringify({ id, method, params }) + "\n");
  });
}

const server = Bun.serve({
  routes: {
    "/": index,
    "/styles.css": {
      GET: () =>
        new Response(Bun.file("./public/styles.css"), {
          headers: { "Content-Type": "text/css; charset=utf-8" },
        }),
    },
    "/api/chat": {
      POST: async req => {
        const { message } = await req.json<{ message: string }>();
        const res = await sendJsonRpc("chat", { message });
        if (res.error) {
          return Response.json({ error: res.error.message }, { status: 500 });
        }
        return Response.json({ reply: (res.result as { reply: string }).reply });
      },
    },
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`Server running at ${server.url}`);
