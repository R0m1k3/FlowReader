import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { articlesApi } from '../api/articles';
import { FocusCardStack } from '../components/focus/FocusCardStack';
import { FocusEmptyState } from '../components/focus/FocusEmptyState';

interface FocusPageProps {
    onExit: () => void;
}

export function FocusPage({ onExit }: FocusPageProps) {
    const queryClient = useQueryClient();
    const [isComplete, setIsComplete] = useState(false);

    // Fetch ONLY unread articles
    const { data: articles, isLoading } = useQuery({
        queryKey: ['articles', 'focus-mode'],
        queryFn: () => articlesApi.list({ unread: true, limit: 100 }), // Cap at 100 for performance
        staleTime: 0, // Always fresh for focus mode
    });

    // Stable deck state to prevent UI jumping when articles are marked read
    const [deck, setDeck] = useState<typeof articles>([]);

    // Initialize/Append deck when data arrives
    if (articles && (!deck || deck.length === 0)) {
        setDeck(articles);
    }
    // Note: A more robust implementation would append new unique items if we implemented pagination/infinite scroll,
    // but for now, snapshotting the initial load is sufficient for the "Focus Session" concept.

    // Mutation to mark read
    const markReadMutation = useMutation({
        mutationFn: (id: string) => articlesApi.markRead(id),
        onSuccess: () => {
            // Invalidate main lists to sync up sidebar, but our local 'deck' state won't change
            queryClient.invalidateQueries({ queryKey: ['articles'] });
            queryClient.invalidateQueries({ queryKey: ['feeds'] });
        },
    });

    // Mutation to toggle favorite
    const toggleFavoriteMutation = useMutation({
        mutationFn: (id: string) => articlesApi.toggleFavorite(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['articles'] });
            queryClient.invalidateQueries({ queryKey: ['feeds'] });
        },
    });

    const handleMarkRead = (id: string) => {
        markReadMutation.mutate(id);
    };

    const handleToggleFavorite = (id: string) => {
        toggleFavoriteMutation.mutate(id);
    };

    const handleKeep = (id: string) => {
        // Do nothing api-wise, just skip. 
        console.log('Skipped:', id);
    };

    if (isLoading && (!deck || deck.length === 0)) {
        return (
            <div className="flex items-center justify-center h-full bg-carbon/50 backdrop-blur-xl">
                <div className="w-16 h-16 border-4 border-nature border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    // Filter out locally read? No, we handle that in stack index.
    // If deck is empty
    if (!deck || deck.length === 0) {
        return <FocusEmptyState onBack={onExit} />;
    }

    if (isComplete) {
        return <FocusEmptyState onBack={onExit} />;
    }

    return (
        <div className="fixed inset-0 z-50 bg-carbon/95 backdrop-blur-3xl flex flex-col">
            {/* Header */}
            <header className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-50">
                <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-xs font-bold uppercase tracking-widest text-paper-white">Mode Focus</span>
                </div>
                <button
                    onClick={onExit}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-nature/10 text-nature shadow-lg hover:bg-nature hover:text-white hover:border-nature hover:scale-105 transition-all duration-300 group"
                    title="Quitter le mode Focus"
                >
                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity hidden sm:inline-block">
                        Retour au Dashboard
                    </span>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </header>

            {/* Main Deck Area */}
            <main className="flex-1 flex items-center justify-center p-4">
                <FocusCardStack
                    articles={deck}
                    onMarkRead={handleMarkRead}
                    onKeep={handleKeep}
                    onToggleFavorite={handleToggleFavorite}
                    onEmpty={() => setIsComplete(true)}
                />
            </main>
        </div>
    );
}
