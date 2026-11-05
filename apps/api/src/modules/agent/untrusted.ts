export type UntrustedSource = "web_search" | "merchant_catalog" | "merchant_quote" | "trip_state";

/**
 * Wraps content the agent did not write (web pages, merchant text, names members typed) in a
 * delimited data block that the system prompt tells the model never to obey. `<` is escaped
 * inside the JSON, so the content cannot close the block or open a fake one.
 */
export function wrapUntrusted(source: UntrustedSource, data: unknown): string {
  const json = JSON.stringify(data).replaceAll("<", "\\u003c");
  return `<untrusted_data source="${source}">\n${json}\n</untrusted_data>`;
}
