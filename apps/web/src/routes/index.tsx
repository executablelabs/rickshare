import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => (
    <main className="px-5 py-5">
      <h1>Rickshare</h1>
    </main>
  ),
});
