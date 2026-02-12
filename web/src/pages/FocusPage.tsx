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

    // Mutation to mark read
    const markReadMutation = useMutation({
        mutationFn: (id: string) => articlesApi.markRead(id),
        onSuccess: () => {
            // Invalidate main lists to sync up when returning
            queryClient.invalidateQueries({ queryKey: ['articles'] });
            queryClient.invalidateQueries({ queryKey: ['feeds'] });
        },
    });

    const handleMarkRead = (id: string) => {
        markReadMutation.mutate(id);
    };

    const handleKeep = (id: string) => {
        // Do nothing api-wise, just skip. 
        // Or strictly speaking, we could have a "skipped" list, but for now just don't mark read.
        console.log('Skipped:', id);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full bg-carbon/50 backdrop-blur-xl">
                <div className="w-16 h-16 border-4 border-nature border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    // Filter out locally read? No, we handle that in stack index.
    // But if API returns empty:
    if (!articles || articles.length === 0) {
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
                    className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all text-paper-white"
                    title="Quitter le mode Focus"
                >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </header>

            {/* Main Deck Area */}
            <main className="flex-1 flex items-center justify-center p-4">
                <FocusCardStack
                    articles={articles}
                    onMarkRead={handleMarkRead}
                    onKeep={handleKeep}
                    onEmpty={() => setIsComplete(true)}
                />
            </main>
        </div>
    );
}
