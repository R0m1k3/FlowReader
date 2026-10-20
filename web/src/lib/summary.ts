/** Splits a summary written as a list ("- …", "• …", "1. …") into its points. */
export function toPoints(summary: string): string[] | null {
    const lines = summary.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const bullet = /^([-•*–]|\d+[.)])\s+/;
    if (lines.length < 2 || !lines.every((l) => bullet.test(l))) return null;
    return lines.map((l) => l.replace(bullet, ''));
}

/** One-line form of a summary for previews (list markers removed). */
export function summaryText(summary: string) {
    return toPoints(summary)?.join(' · ') ?? summary;
}
