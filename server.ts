import index from "./index.html";

const requestedPort = Number(Bun.env.PORT ?? 3000);

function startServer(port: number) {
  return Bun.serve({
    port,
    routes: {
      "/": index,
    },
    development: {
      hmr: true,
      console: true,
    },
  });
}

function isPortInUseError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EADDRINUSE";
}

const candidatePorts = Bun.env.PORT
  ? [requestedPort]
  : [requestedPort, 3001, 3002, 3003, 3004, 3005];

let server: ReturnType<typeof Bun.serve> | undefined;
let lastError: unknown;

for (const port of candidatePorts) {
  try {
    server = startServer(port);
    break;
  } catch (error) {
    if (!isPortInUseError(error)) {
      throw error;
    }

    lastError = error;
    console.warn(`Port ${port} is in use.`);
  }
}

if (!server) {
  throw lastError;
}

console.log(`Server running at ${server.url}`);
