import { useSyncExternalStore } from 'react';

// Matches Tailwind's md breakpoint (768px): below it is the phone layout.
const query = '(max-width: 767.98px)';

function subscribe(cb: () => void) {
    const media = window.matchMedia(query);
    media.addEventListener('change', cb);
    return () => media.removeEventListener('change', cb);
}

export function useIsMobile() {
    return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

/** True when the user asked the OS to minimise motion. */
export function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
