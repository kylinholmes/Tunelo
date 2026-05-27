import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

let __shown = false;
const showWindow = async (reason) => {
  if (__shown) return;
  __shown = true;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    await win.show();
    await win.setFocus();
    console.log(`[boot] window shown via ${reason}`);
  } catch {
    // Non-Tauri context (e.g. plain browser dev) — no-op.
  }
};

// Primary: wait for fonts ready, then one paint, then show.
const waitFonts = document.fonts?.ready ?? Promise.resolve();
waitFonts.then(() => {
  requestAnimationFrame(() => requestAnimationFrame(() => showWindow("fonts+rAF")));
});
// Safety net: never let the window stay hidden, even if fonts hang or React crashes.
setTimeout(() => showWindow("timeout-1500ms"), 1500);
