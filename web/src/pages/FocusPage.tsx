import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { articlesApi, type Article } from '../api/articles';
import { FocusCardStack } from '../components/focus/FocusCardStack';
import { FocusEmptyState } from '../components/focus/FocusEmptyState';

interface FocusPageProps {
    onExit: () => void;
}

export function FocusPage({ onExit }: FocusPageProps) {
    const queryClient = useQueryClient();
    const [isComplete, setIsComplete] = useState(false);

    const { data: articles, isLoading } = useQuery({
        queryKey: ['articles', 'focus-mode'],
        queryFn: () => articlesApi.list({ unread: true, limit: 100 }),
        staleTime: 0,
    });

    // Snapshot the unread set once into a stable deck for the whole session,
    // so marking articles read mid-session never reshuffles the stack. This is
    // the React-endorsed "adjust state during render" pattern (guarded to run
    // exactly once), not an effect.
    const [deck, setDeck] = useState<Article[]>([]);
    const [seeded, setSeeded] = useState(false);
    if (!seeded && articles && articles.length > 0) {
        setDeck(articles);
        setSeeded(true);
    }

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ['articles'] });
        queryClient.invalidateQueries({ queryKey: ['feeds'] });
    };

    const markReadMutation = useMutation({ mutationFn: (id: string) => articlesApi.markRead(id), onSuccess: invalidate });
    const toggleFavoriteMutation = useMutation({ mutationFn: (id: string) => articlesApi.toggleFavorite(id), onSuccess: invalidate });

    if (isLoading && deck.length === 0) {
        return (
            <div className="flex items-center justify-center h-full bg-carbon/60 backdrop-blur-xl">
                <div className="w-14 h-14 border-2 border-nature/20 border-t-nature rounded-full animate-spin" />
            </div>
        );
    }

    if (deck.length === 0 || isComplete) {
        return (
            <div className="fixed inset-0 z-50 bg-carbon/95 backdrop-blur-2xl flex items-center justify-center">
                <FocusEmptyState onBack={onExit} />
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 bg-carbon/95 backdrop-blur-2xl flex flex-col">
            <header className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-50">
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-earth animate-pulse" />
                    <span className="eyebrow text-paper-white">Mode Focus</span>
                </div>
                <button onClick={onExit} className="btn-secondary" title="Quitter le mode Focus">
                    <span className="hidden sm:inline">Tableau de bord</span>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </header>

            <main className="flex-1 flex items-center justify-center p-4">
                <FocusCardStack
                    articles={deck}
                    onMarkRead={(id) => markReadMutation.mutate(id)}
                    onKeep={() => { /* skip — no API action */ }}
                    onToggleFavorite={(id) => toggleFavoriteMutation.mutate(id)}
                    onEmpty={() => setIsComplete(true)}
                />
            </main>
        </div>
    );
}
