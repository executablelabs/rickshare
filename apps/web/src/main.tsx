import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Splash } from "./components/brand/Splash";
import { AppProviders } from "./providers";
import { createAppRouter } from "./router";
import "./styles/tokens.css";

const root = document.getElementById("root");
if (!root) throw new Error("The application root is missing.");

createRoot(root).render(
  <StrictMode>
    <AppProviders router={createAppRouter()} />
    <Splash />
  </StrictMode>,
);
