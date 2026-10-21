import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./style.css";

const root = document.querySelector("#root");
if (!root) throw new Error("Missing review root");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
