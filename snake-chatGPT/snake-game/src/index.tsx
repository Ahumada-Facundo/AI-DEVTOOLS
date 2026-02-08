import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

const rootEl = document.getElementById("root");

if (!rootEl) {
  // Esto te evita pantalla en blanco si el root no existe
  document.body.innerHTML =
    "<div style='padding:20px;font-size:18px;color:#111'>Missing <b>#root</b> in public/index.html</div>";
} else {
  const root = ReactDOM.createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
