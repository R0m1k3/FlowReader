import { useEffect } from 'react';

/** Closes a popover on outside pointer down or Escape, returning focus to its trigger. */
export function useDismiss(open: boolean, close: () => void, refs: React.RefObject<HTMLElement | null>[]) {
    useEffect(() => {
        if (!open) return;
        const onDown = (e: PointerEvent) => {
            if (!refs.some((r) => r.current?.contains(e.target as Node))) close();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                close();
            }
        };
        document.addEventListener('pointerdown', onDown);
        window.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onDown);
            window.removeEventListener('keydown', onKey);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, close]);
}

/** Arrow-key navigation between a menu's items. */
export function onMenuKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]'));
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next =
        e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
}
