import { createRoot } from "react-dom/client";
import App from "./App";

const container = document.getElementById("root")!;

const root = import.meta.hot
  ? (import.meta.hot.data.root ??= createRoot(container))
  : createRoot(container);
root.render(<App />);
