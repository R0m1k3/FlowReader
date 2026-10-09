import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { feedsApi, type Feed } from '../api/feeds';

interface ManageFeedsModalProps {
    onClose: () => void;
    /** Called when the currently selected feed is deleted. */
    onDeleted: (id: string) => void;
}

function FeedRow({ feed, onDeleted }: { feed: Feed; onDeleted: (id: string) => void }) {
    const qc = useQueryClient();
    const [editing, setEditing] = useState(false);
    const [title, setTitle] = useState(feed.title);

    const rename = useMutation({
        mutationFn: (t: string) => feedsApi.update(feed.id, t),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['feeds'] });
            setEditing(false);
        },
    });
    const remove = useMutation({
        mutationFn: () => feedsApi.delete(feed.id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['feeds'] });
            qc.invalidateQueries({ queryKey: ['articles'] });
            onDeleted(feed.id);
        },
    });

    return (
        <li className="flex items-center gap-2 py-2.5 border-b border-paper-muted/10 last:border-0">
            {editing ? (
                <form
                    className="flex-1 flex items-center gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (title.trim()) rename.mutate(title.trim());
                    }}
                >
                    <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="input-field !py-2 text-sm"
                        aria-label="Nom du flux"
                        autoFocus
                    />
                    <button type="submit" className="btn-primary !min-h-9 !px-4" disabled={rename.isPending}>
                        Enregistrer
                    </button>
                    <button type="button" className="btn-ghost !min-h-9" onClick={() => setEditing(false)}>
                        Annuler
                    </button>
                </form>
            ) : (
                <>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-paper-white truncate">{feed.title}</p>
                        <p className={`text-xs truncate ${feed.fetch_error ? 'text-danger' : 'text-paper-muted'}`}>
                            {feed.fetch_error ? `Erreur : ${feed.fetch_error}` : feed.url}
                        </p>
                    </div>
                    <button className="btn-ghost !min-h-9 !px-3" onClick={() => setEditing(true)}>
                        Renommer
                    </button>
                    <button
                        className="btn-ghost !min-h-9 !px-3 hover:!text-danger hover:!bg-danger/10"
                        disabled={remove.isPending}
                        onClick={() => {
                            if (window.confirm(`Supprimer « ${feed.title} » et ses articles ?`)) remove.mutate();
                        }}
                    >
                        Supprimer
                    </button>
                </>
            )}
        </li>
    );
}

/** Rename and delete subscriptions (formerly in the sidebar). */
export function ManageFeedsModal({ onClose, onDeleted }: ManageFeedsModalProps) {
    const { data: feeds } = useQuery({ queryKey: ['feeds'], queryFn: () => feedsApi.list() });

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-nature-dark/50 animate-fade-in overflow-y-auto"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="manage-feeds-title"
        >
            <div className="w-full max-w-xl surface-card p-6 animate-rise">
                <div className="flex items-center justify-between mb-4">
                    <h2 id="manage-feeds-title" className="text-2xl font-serif text-paper-white">Mes flux</h2>
                    <button onClick={onClose} className="icon-btn" aria-label="Fermer">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                {feeds && feeds.length > 0 ? (
                    <ul>
                        {feeds.map((f) => (
                            <FeedRow key={f.id} feed={f} onDeleted={onDeleted} />
                        ))}
                    </ul>
                ) : (
                    <p className="text-paper-muted text-sm">Aucun flux. Ajoutez-en un avec le bouton +.</p>
                )}
            </div>
        </div>
    );
}
