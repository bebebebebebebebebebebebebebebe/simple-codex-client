import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
} from "@assistant-ui/react";
import { Thread } from "@/components/assistant-ui/thread";
import { Sidebar } from "@/components/chat/Sidebar";
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { useCallback, useState } from "react";

const demoModel: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const lastMessage = messages.at(-1);
    const textPart = lastMessage?.content.find((part) => part.type === "text");
    const input = textPart?.type === "text" ? textPart.text : "";
    const response = `${input || "empty message"}`;

    let accumulated = "";
    for (const word of response.split(" ")) {
      if (abortSignal.aborted) return;
      accumulated += word + " ";
      yield { content: [{ type: "text", text: accumulated }] };
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
  },
};

function ChatRoute() {
  const runtime = useLocalRuntime(demoModel);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <main className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar isOpen={sidebarOpen} onToggle={toggleSidebar} />
        <section
          className="flex-1 h-[calc(100vh-4em)] min-h-0 overflow-hidden rounded-lg border bg-background text-foreground shadow-sm"
          aria-label="Assistant chat"
        >
          <Thread />
        </section>
      </main>
    </AssistantRuntimeProvider>
  );
}

function RootLayout() {
  return (
    <div className="grid min-h-screen grid-rows-[auto_1fr] bg-background text-foreground">
      <header className="flex gap-3 border-b bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:flex-row sm:items-center justify-between sm:px-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            Simple Codex Client
          </h1>
        </div>
        <span className="w-fit rounded-md border bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
          Local runtime
        </span>
      </header>
      <Outlet />
    </div>
  );
}

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ChatRoute,
});

const routeTree = rootRoute.addChildren([indexRoute]);

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export default function App() {
  return <RouterProvider router={router} />;
}
