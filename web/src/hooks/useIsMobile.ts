import { useSyncExternalStore } from 'react';

const query = '(max-width: 768px)';

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
