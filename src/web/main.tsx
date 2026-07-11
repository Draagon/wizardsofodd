import { createRoot } from "react-dom/client";
import { App } from "./App";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Phase-U bundle: #root element not in DOM");
createRoot(rootEl).render(<App />);
