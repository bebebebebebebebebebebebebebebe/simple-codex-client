import { createRoot } from "react-dom/client";
import App from "./App";

// Inject Tailwind CLI-built CSS (includes all utility classes)
const styleLink = document.createElement("link");
styleLink.rel = "stylesheet";
styleLink.href = "/styles.css";
document.head.appendChild(styleLink);

const container = document.getElementById("root")!;

const root = import.meta.hot
  ? (import.meta.hot.data.root ??= createRoot(container))
  : createRoot(container);
root.render(<App />);
