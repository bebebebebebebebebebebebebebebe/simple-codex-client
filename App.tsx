import { MyRuntimeProvider } from "./MyRuntimeProvider";
import { Thread } from "@/components/assistant-ui/thread";

export default function App() {
  return (
    <MyRuntimeProvider>
      <div className="h-screen">
        <Thread />
      </div>
    </MyRuntimeProvider>
  );
}
