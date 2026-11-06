import { createRouter, type RouterHistory } from "@tanstack/react-router";
import { RouteLoader } from "./components/brand/Loader";
import { routeTree } from "./routeTree.gen";

export function createAppRouter(history?: RouterHistory) {
  return createRouter({
    routeTree,
    defaultPendingComponent: RouteLoader,
    ...(history ? { history } : {}),
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
