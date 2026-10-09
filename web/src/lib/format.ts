// Formatters are built once: constructing Intl objects per render is costly in long lists.
const shortDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const longDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const relative = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

export function formatShort(iso?: string) {
    return iso ? shortDate.format(new Date(iso)) : '';
}

export function formatLong(iso?: string) {
    return iso ? longDate.format(new Date(iso)) : '';
}

/** "il y a 5 min", "hier"… falling back to a short date after a week. */
export function formatRelative(iso?: string) {
    if (!iso) return '';
    const diff = (new Date(iso).getTime() - Date.now()) / 1000;
    const abs = Math.abs(diff);
    if (abs < 60) return "à l'instant";
    if (abs < 3600) return relative.format(Math.round(diff / 60), 'minute');
    if (abs < 86400) return relative.format(Math.round(diff / 3600), 'hour');
    if (abs < 7 * 86400) return relative.format(Math.round(diff / 86400), 'day');
    return shortDate.format(new Date(iso));
}

export function readingTimeLabel(minutes?: number) {
    return `${Math.max(1, minutes ?? 1)} min`;
}
