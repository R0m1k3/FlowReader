import { lazy, type ComponentType } from 'react';

/**
 * React.lazy for a named export. After a deploy, chunks of the previous build
 * no longer exist on the server: reload once to pick up the new version
 * instead of showing a blank screen.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyNamed<T extends ComponentType<any>>(load: () => Promise<Record<string, unknown>>, name: string) {
    return lazy(async () => {
        try {
            const mod = await load();
            sessionStorage.removeItem('chunk-reload');
            return { default: mod[name] as T };
        } catch (err) {
            if (!sessionStorage.getItem('chunk-reload')) {
                sessionStorage.setItem('chunk-reload', '1');
                window.location.reload();
            }
            throw err;
        }
    });
}
