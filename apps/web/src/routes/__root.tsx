import { createRootRoute, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: Root,
});

function Root() {
  return (
    <main className="px-5 py-5">
      <Outlet />
    </main>
  );
}
