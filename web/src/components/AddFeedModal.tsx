import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { feedsApi } from '../api/feeds';

interface AddFeedModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function AddFeedModal({ isOpen, onClose }: AddFeedModalProps) {
    const [url, setUrl] = useState('');
    const queryClient = useQueryClient();

    const addFeedMutation = useMutation({
        mutationFn: (url: string) => feedsApi.add({ url }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['feeds'] });
            setUrl('');
            onClose();
        },
    });

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        addFeedMutation.mutate(url);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-carbon-dark/80 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose}>
            <div
                className="w-full max-w-md glass-panel p-8 rounded-2xl shadow-2xl border border-gold/10 animate-in zoom-in duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-serif text-gold italic">Nouveau Flux</h2>
                    <button onClick={onClose} className="text-paper-muted hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <p className="text-paper-muted text-xs mb-6 leading-relaxed">
                    Entrez l'URL d'un flux RSS ou Atom. FlowReader récupérera automatiquement le titre et le contenu.
                </p>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <label className="block text-[10px] uppercase tracking-[0.2em] font-bold text-paper-muted">URL du Flux</label>
                        <input
                            type="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            className="input-field w-full"
                            placeholder="https://exemple.com/feed"
                            required
                            autoFocus
                        />
                    </div>

                    {addFeedMutation.isError && (
                        <p className="text-red-400 text-xs italic">Échec de l'ajout. Vérifiez l'URL du flux.</p>
                    )}

                    <div className="flex justify-end pt-4 gap-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="btn-ghost"
                        >
                            Annuler
                        </button>
                        <button
                            type="submit"
                            disabled={url.length < 5 || addFeedMutation.isPending}
                            className="btn-primary"
                        >
                            {addFeedMutation.isPending ? 'Ajout...' : 'S\'abonner'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
