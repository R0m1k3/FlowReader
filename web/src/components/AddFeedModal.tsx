import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { feedsApi } from '../api/feeds';

interface AddFeedModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function AddFeedModal({ isOpen, onClose }: AddFeedModalProps) {
    const [url, setUrl] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const queryClient = useQueryClient();

    const addFeedMutation = useMutation({
        mutationFn: (u: string) => feedsApi.add({ url: u }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['feeds'] });
            setUrl('');
            onClose();
        },
    });

    const importMutation = useMutation({
        mutationFn: (file: File) => feedsApi.importOPML(file),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ['feeds'] });
            queryClient.invalidateQueries({ queryKey: ['articles'] });
            window.alert(`${res.imported} flux importé(s), ${res.skipped} ignoré(s).`);
            onClose();
        },
    });

    // Close on Escape
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        addFeedMutation.mutate(url);
    };

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) importMutation.mutate(file);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-nature-dark/60 backdrop-blur-sm"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="add-feed-title"
                >
                    <motion.div
                        className="w-full max-w-md surface-card p-8"
                        initial={{ opacity: 0, scale: 0.95, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 12 }}
                        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-2">
                            <h2 id="add-feed-title" className="text-2xl font-serif italic text-nature">Nouveau flux</h2>
                            <button onClick={onClose} className="icon-btn" aria-label="Fermer">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <p className="text-paper-muted text-sm mb-6 leading-relaxed font-reading">
                            Entrez l'URL d'un flux RSS ou Atom. FlowReader récupérera le titre et le contenu automatiquement.
                        </p>

                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="space-y-2">
                                <label htmlFor="feed-url" className="block eyebrow text-paper-muted">URL du flux</label>
                                <input
                                    id="feed-url"
                                    type="url"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    className="input-field"
                                    placeholder="https://exemple.com/feed"
                                    required
                                    autoFocus
                                />
                            </div>

                            {addFeedMutation.isError && (
                                <p className="text-danger text-xs" role="alert">Échec de l'ajout. Vérifiez l'URL du flux.</p>
                            )}

                            <div className="flex justify-end gap-3">
                                <button type="button" onClick={onClose} className="btn-ghost">Annuler</button>
                                <button type="submit" disabled={url.length < 5 || addFeedMutation.isPending} className="btn-primary">
                                    {addFeedMutation.isPending ? 'Ajout…' : "S'abonner"}
                                </button>
                            </div>
                        </form>

                        {/* OPML import */}
                        <div className="mt-6 pt-5 border-t border-paper-muted/12">
                            <input ref={fileInputRef} type="file" accept=".opml,.xml,text/xml" className="hidden" onChange={handleFile} />
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
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
