export function formatLateDuration(mins: number | null | undefined): string {
  const m = Math.max(0, Math.round(Number(mins || 0)));
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem > 0 ? `${h}h ${rem}m late` : `${h}h late`;
  }
  return `${m}m late`;
}

export function formatTargetSectionsLabel(
  sections: string[] | string | null | undefined,
  fallback = 'All Sections'
): string {
  if (!sections) return fallback;
  const list = Array.isArray(sections)
    ? sections.map((s) => String(s).trim()).filter(Boolean)
    : String(sections)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
  if (list.length === 0 || list.some((s) => s.toUpperCase() === 'ALL')) {
    return fallback;
  }
  return list.join(', ');
}
