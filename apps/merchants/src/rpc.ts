import { custom, http, type Transport } from "viem";

let queue = Promise.resolve();
let nextRequestAt = 0;
let blockedUntil = 0;

export function isRpcRateLimit(error: unknown): boolean {
  let cause = error;
  for (let depth = 0; depth < 10 && cause instanceof Error; depth++) {
    const rpc = cause as Error & { code?: unknown; status?: unknown };
    if (rpc.code === -32005 || rpc.code === "RPC_RATE_LIMITED" || rpc.status === 429) return true;
    cause = rpc.cause;
  }
  return false;
}

/** Keep discovery and delivery reads within one merchant-process RPC budget. */
export function createPacedArcTransport(url: string | undefined): Transport {
  if (url && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname))
    return http(url, { timeout: 15_000, retryCount: 0 });
  return (options) => {
    const transport = http(url, { timeout: 15_000, retryCount: 0 })(options);
    const request = (
      args: Parameters<typeof transport.request>[0],
      requestOptions?: Parameters<typeof transport.request>[1],
    ) => {
      const result = queue.then(async () => {
        if (Date.now() < blockedUntil)
          throw Object.assign(new Error("Arc RPC is temporarily rate limited."), { code: -32005 });
        const delay = nextRequestAt - Date.now();
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
        nextRequestAt = Date.now() + 600;
        try {
          return await transport.request(args, requestOptions);
        } catch (error) {
          if (isRpcRateLimit(error)) blockedUntil = Date.now() + 15_000;
          throw error;
        }
      });
      queue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    };
    return custom({ request }, { key: "paced-arc", name: "Paced Arc RPC", retryCount: 0 })(options);
  };
}
