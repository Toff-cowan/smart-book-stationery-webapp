const RECENT_KEY = "sbs_recent_catalog_searches";
export const MAX_RECENT_SEARCHES = 8;

export function loadRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}

export function pushRecentSearch(term: string) {
  const cleaned = term.trim();
  if (cleaned.length < 2) return;
  const next = [
    cleaned,
    ...loadRecentSearches().filter(
      (t) => t.toLowerCase() !== cleaned.toLowerCase(),
    ),
  ].slice(0, MAX_RECENT_SEARCHES);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}
