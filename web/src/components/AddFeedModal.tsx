import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { feedsApi } from '../api/feeds';
import { ApiError } from '../api/client';

interface AddFeedModalProps {
    onClose: () => void;
}

export function AddFeedModal({ onClose }: AddFeedModalProps) {
    const [url, setUrl] = useState('');
    const [importResult, setImportResult] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const previousFocus = useRef<HTMLElement | null>(null);
    const queryClient = useQueryClient();

    const addFeedMutation = useMutation({
        mutationFn: (u: string) => feedsApi.add({ url: u.trim() }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['feeds'] });
            onClose();
        },
    });

    const importMutation = useMutation({
        mutationFn: (file: File) => feedsApi.importOPML(file),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ['feeds'] });
            setImportResult(
                `${res.imported} flux importé${res.imported > 1 ? 's' : ''}, ${res.skipped} ignoré${res.skipped > 1 ? 's' : ''}.`,
            );
        },
    });

    useEffect(() => {
        previousFocus.current = document.activeElement as HTMLElement | null;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('keydown', onKey);
            previousFocus.current?.focus?.();
        };
    }, [onClose]);

    const addError =
        addFeedMutation.error instanceof ApiError && addFeedMutation.error.status === 409
            ? 'Vous êtes déjà abonné à ce flux.'
            : 'Échec de l’ajout. Vérifiez l’adresse du flux.';

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-nature-dark/60 animate-fade-in"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-feed-title"
        >
            <div className="w-full max-w-md surface-card p-6 sm:p-8 animate-rise" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-2">
                    <h2 id="add-feed-title" className="text-2xl font-serif italic text-nature">Nouveau flux</h2>
                    <button onClick={onClose} className="icon-btn" aria-label="Fermer">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <p className="text-paper-muted text-sm mb-6 leading-relaxed font-reading">
                    Entrez l'URL d'un flux RSS ou Atom. FlowReader récupérera le titre et les articles automatiquement.
                </p>

                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        addFeedMutation.mutate(url);
                    }}
                    className="space-y-5"
                >
                    <div className="space-y-2">
                        <label htmlFor="feed-url" className="block eyebrow text-paper-muted">URL du flux</label>
                        <input
                            id="feed-url"
                            type="url"
                            inputMode="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            className="input-field"
                            placeholder="https://exemple.com/feed"
                            required
                            autoFocus
                            aria-invalid={addFeedMutation.isError}
                            aria-describedby={addFeedMutation.isError ? 'feed-url-error' : undefined}
                        />
                    </div>

                    {addFeedMutation.isError && (
                        <p id="feed-url-error" className="text-danger text-sm" role="alert">{addError}</p>
                    )}

                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="btn-ghost">Annuler</button>
                        <button type="submit" disabled={url.trim().length < 5 || addFeedMutation.isPending} className="btn-primary">
                            {addFeedMutation.isPending ? 'Ajout…' : "S'abonner"}
                        </button>
                    </div>
                </form>

                {/* OPML import */}
                <div className="mt-6 pt-5 border-t border-paper-muted/12">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".opml,.xml,text/xml,application/xml"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) importMutation.mutate(file);
                            e.target.value = '';
                        }}
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={importMutation.isPending}
                        className="btn-ghost w-full justify-center"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        {importMutation.isPending ? 'Import en cours…' : 'Importer un fichier OPML'}
                    </button>
                    <p className="text-sm text-center mt-2" role="status" aria-live="polite">
                        {importResult && <span className="text-nature">{importResult}</span>}
                        {importMutation.isError && <span className="text-danger">Fichier OPML invalide ou trop volumineux.</span>}
                    </p>
                </div>
            </div>
        </div>
    );
}
