const activityReference = /\[([^\]\r\n]+)\]\(#activity\/([^/\s)]+)\/([^/\s)]+)\)/g;

function activityKey(merchant: string, item: string): string | undefined {
  try {
    const ids = [decodeURIComponent(merchant), decodeURIComponent(item)];
    if (ids.some((id) => id.trim().length === 0 || id.length > 128)) return undefined;
    return JSON.stringify(ids);
  } catch {
    // A malformed reference remains ordinary text and cannot select a catalog entry.
    return undefined;
  }
}

export function activitySuggestions(text: string): string[] {
  const keys = new Set<string>();
  for (const match of text.matchAll(activityReference)) {
    const merchant = match[2];
    const item = match[3];
    if (!merchant || !item) continue;
    const key = activityKey(merchant, item);
    if (key) keys.add(key);
  }
  return [...keys];
}

export function activityText(text: string): string {
  return text.replace(
    activityReference,
    (reference, label: string, merchant: string, item: string) =>
      activityKey(merchant, item) ? label : reference,
  );
}
