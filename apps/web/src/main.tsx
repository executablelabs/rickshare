import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Splash } from "./components/brand/Splash";
import { closeIfWorldPopup } from "./lib/world";
import { AppProviders } from "./providers";
import { createAppRouter } from "./router";
import "./styles/tokens.css";

// The World callback lands in the verification popup; the opening tab polls for the result.
closeIfWorldPopup();

const root = document.getElementById("root");
if (!root) throw new Error("The application root is missing.");

createRoot(root).render(
  <StrictMode>
    <AppProviders router={createAppRouter()} />
    <Splash />
  </StrictMode>,
);
