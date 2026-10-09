import { useUpdate } from '../stores/updateStore';

/** Offers to load a new app version instead of reloading under the reader. */
export function UpdateToast() {
    const apply = useUpdate((s) => s.apply);
    const dismiss = useUpdate((s) => s.dismiss);
    if (!apply) return null;

    return (
        <div
            role="status"
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-3 pl-5 pr-2 py-2 rounded-full surface-card animate-rise"
        >
            <span className="text-sm text-paper-white">Nouvelle version disponible</span>
            <button className="btn-primary !min-h-9 !px-4" onClick={apply}>Mettre à jour</button>
            <button className="btn-ghost !min-h-9 !px-3" onClick={dismiss} aria-label="Plus tard">Plus tard</button>
        </div>
    );
}
