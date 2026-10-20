// Every swatch keeps white initials above 4.5:1.
const SWATCHES = ['#A4532E', '#5B4BA6', '#2E5E9E', '#2F6F4E', '#2B7A78', '#8A5A0E', '#4B5563', '#9C3D54'];

function swatchFor(key: string) {
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
    return SWATCHES[Math.abs(h) % SWATCHES.length];
}

interface FeedAvatarProps {
    /** Stable key for the color (the feed id). */
    id: string;
    title?: string;
    size?: number;
    className?: string;
}

/** Colored initial standing in for a feed's icon (no third-party favicon request). */
export function FeedAvatar({ id, title, size = 20, className = '' }: FeedAvatarProps) {
    const initial = (title || '?').trim().charAt(0).toUpperCase();
    return (
        <span
            aria-hidden="true"
            className={`inline-flex items-center justify-center shrink-0 text-white font-bold leading-none select-none ${className}`}
            style={{
                width: size,
                height: size,
                borderRadius: Math.round(size * 0.3),
                fontSize: Math.round(size * 0.55),
                background: swatchFor(id),
            }}
        >
            {initial}
        </span>
    );
}
