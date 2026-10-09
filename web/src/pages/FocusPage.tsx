import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { articlesApi } from '../api/articles';
import { FocusCardStack } from '../components/focus/FocusCardStack';
import { FocusEmptyState } from '../components/focus/FocusEmptyState';

interface FocusPageProps {
    onExit: () => void;
}

export function FocusPage({ onExit }: FocusPageProps) {
    const [isComplete, setIsComplete] = useState(false);

    // Snapshot of unread articles for the session. Read/favorite updates are
    // patched into this cache entry, never refetched, so the deck stays stable.
    const { data: articles, isPending, isError, refetch } = useQuery({
        queryKey: ['articles', 'focus'],
        queryFn: () => articlesApi.list({ unread: true, limit: 100 }),
        staleTime: Infinity,
        gcTime: 0,
    });

    // Deck order is frozen on first load (ids only; live data comes from the cache).
    const [deckIds, setDeckIds] = useState<string[] | null>(null);
    if (deckIds === null && articles) setDeckIds(articles.map((a) => a.id));

    const byId = new Map((articles ?? []).map((a) => [a.id, a]));
    const deck = (deckIds ?? []).map((id) => byId.get(id)).filter((a) => !!a);

    let body: React.ReactNode;
    if (isPending) {
        body = (
            <div className="flex-1 flex items-center justify-center" role="status" aria-label="Chargement">
                <div className="w-14 h-14 border-2 border-nature/20 border-t-nature rounded-full animate-spin" />
            </div>
        );
    } else if (isError) {
        body = (
            <div role="alert" className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
                <p className="font-serif italic text-xl text-paper-white">Impossible de charger vos articles.</p>
                <button onClick={() => refetch()} className="btn-secondary">Réessayer</button>
            </div>
        );
    } else if (deck.length === 0 || isComplete) {
        body = <FocusEmptyState onBack={onExit} />;
    } else {
        body = (
            <main className="flex-1 flex items-center justify-center p-4 min-h-0">
                <FocusCardStack articles={deck} onEmpty={() => setIsComplete(true)} onExit={onExit} />
            </main>
        );
    }

    return (
        <MotionConfig reducedMotion="user">
            <div className="fixed inset-0 z-50 bg-carbon flex flex-col animate-fade-in" role="region" aria-label="Mode Focus">
                <header className="flex justify-between items-center p-4 sm:p-6 shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-earth animate-pulse" aria-hidden="true" />
                        <span className="eyebrow text-paper-white">Mode Focus</span>
                    </div>
                    <button onClick={onExit} className="btn-secondary" title="Quitter le mode Focus (Échap)">
                        <span className="hidden sm:inline">Tableau de bord</span>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        <span className="sr-only sm:hidden">Quitter</span>
                    </button>
                </header>
                {body}
            </div>
        </MotionConfig>
    );
}
