import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Wallet tests supply their own fixtures, independent of an operator's local Privy app.
vi.stubEnv("VITE_PRIVY_APP_ID", "");

afterEach(cleanup);
