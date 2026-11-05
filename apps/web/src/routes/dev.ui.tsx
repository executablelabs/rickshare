import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dev/ui")({
  component: () => (
    <main className="px-5 py-5">
      <h1>UI gallery</h1>
    </main>
  ),
});
