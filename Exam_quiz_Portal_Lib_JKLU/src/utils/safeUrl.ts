/**
 * Render-time external URL sanitizer for <a href> and window.open sinks.
 * Allows only https:// (and optionally mailto:) URLs, rejecting javascript:, data:, vbscript:, etc.
 */
export function safeExternalUrl(rawUrl?: string | null): string | undefined {
  if (!rawUrl) return undefined;
  const trimmed = String(rawUrl).trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return undefined;
  } catch {
    return undefined;
  }
}
