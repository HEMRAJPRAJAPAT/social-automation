export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function normalizeTitle(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(input: string): Set<string> {
  return new Set(normalizeTitle(input).split(' ').filter(Boolean));
}

/** Jaccard similarity over word tokens; 1 = identical bag of words, 0 = disjoint. */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 && setB.size === 0) return 1;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** True if `candidate` is close enough to any of `existing` to count as a repeat. */
export function isNearDuplicate(candidate: string, existing: string[], threshold = 0.6): boolean {
  return existing.some((title) => jaccardSimilarity(candidate, title) >= threshold);
}

export function truncateWords(input: string, maxWords: number): string {
  const words = input.trim().split(/\s+/);
  if (words.length <= maxWords) return input.trim();
  return `${words.slice(0, maxWords).join(' ')}…`;
}

export function countWords(input: string): number {
  return input.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Escapes a value for safe interpolation into an ffmpeg filtergraph string
 * (e.g. inside `drawtext=text='...'` or `subtitles='...'`), where the value
 * itself is wrapped in single quotes by the caller. FFmpeg's single-quoted
 * values follow shell-style quoting, NOT backslash-escaping: a literal `'`
 * must close the quote, emit an escaped quote, and reopen (`'\''`) — a bare
 * `\'` does NOT work and corrupts the rest of the filtergraph (verified:
 * this broke drawtext on a label containing an apostrophe). `:` and `%`
 * still need backslash-escaping since they're active even inside quotes.
 */
export function escapeFfmpegFilterValue(raw: string): string {
  return raw
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%')
    .replace(/'/g, "'\\''");
}

/**
 * Diagram-card labels come from LLM output and get burned in via
 * `drawtext`, so they're stripped to a safe character set server-side
 * rather than relying purely on escaping — a stray unescapable character
 * would otherwise break the whole ffmpeg filtergraph mid-render.
 */
export function sanitizeDrawtextLabel(raw: string, maxLength = 40): string {
  const cleaned = raw
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N} '\-.,?!]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return truncateWords(cleaned, 8).slice(0, maxLength);
}
