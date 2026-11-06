import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Loader } from "../components/brand/Loader";

const Preview = import.meta.env.DEV ? lazy(() => import("../test/TripPreview")) : null;

export const Route = createFileRoute("/dev/trip")({
  component: () =>
    Preview ? (
      <Suspense fallback={<Loader label="Loading preview" />}>
        <p className="px-5 py-3 text-sm text-ink-muted">Layout preview. Actions are disabled.</p>
        <Preview />
      </Suspense>
    ) : (
      <main className="px-5 py-6">
        <h1>Preview unavailable</h1>
      </main>
    ),
});
