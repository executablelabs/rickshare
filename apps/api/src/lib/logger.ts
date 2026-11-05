export const logger = {
  error(code: string): void {
    // Log stable codes only; raw exceptions can contain credentials or request data.
    process.stderr.write(`${JSON.stringify({ level: "error", code })}\n`);
  },
};
