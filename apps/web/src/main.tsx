import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProviders } from "./providers";
import { createAppRouter } from "./router";
import "./styles/tokens.css";

const root = document.getElementById("root");
if (!root) throw new Error("The application root is missing.");

createRoot(root).render(
  <StrictMode>
    <AppProviders router={createAppRouter()} />
  </StrictMode>,
);
