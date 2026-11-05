import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dev/ui")({
  component: () => <h1>UI gallery</h1>,
});
