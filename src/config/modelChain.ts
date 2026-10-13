/**
 * The ordered, de-duplicated list of models to try: the primary, then each
 * comma-separated fallback. A duplicate would make the fallback chain retry a
 * model that has just failed: Render sets GEMINI_TEXT_MODEL to
 * gemini-flash-lite-latest, which is also the first default fallback, so on
 * Oct 13 the chain would have spent a second attempt on the same overloaded
 * model before reaching the one that was answering.
 */
export function modelChain(primary: string, fallbacksCsv: string): string[] {
  return [
    ...new Set(
      [primary, ...fallbacksCsv.split(',')]
        .map((model) => model.trim())
        .filter((model) => model.length > 0),
    ),
  ];
}
