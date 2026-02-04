import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { articlesApi } from '../api/articles';
import { feedsApi } from '../api/feeds';
import { ArticleCard } from '../components/ArticleCard';
import { ReaderView } from '../components/ReaderView';
import { useWebsocket } from '../hooks/useWebsocket';
import type { Article } from '../api/articles';

interface DashboardPageProps {
    selectedFeedId: string | null;
}

export function DashboardPage({ selectedFeedId }: DashboardPageProps) {
    const queryClient = useQueryClient();
    const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

    // Real-time sync
    useWebsocket();

    const { data: articles, isLoading } = useQuery({
        queryKey: ['articles', selectedFeedId],
        queryFn: () => articlesApi.list({ feed_id: selectedFeedId || undefined }),
    });

    const refreshMutation = useMutation({
        mutationFn: () => feedsApi.refresh(),
        onSuccess: () => {
            // Optimistic feedback or just wait for WS? 
            // In case WS fails, we invalid articles
            queryClient.invalidateQueries({ queryKey: ['articles'] });
        },
    });

    const toggleReadMutation = useMutation({
        mutationFn: ({ id, is_read }: { id: string; is_read: boolean }) =>
            is_read ? articlesApi.markRead(id) : articlesApi.markUnread(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['articles'] }),
    });

    const toggleFavoriteMutation = useMutation({
        mutationFn: articlesApi.toggleFavorite,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['articles'] }),
    });

    if (isLoading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-carbon space-y-4">
                <div className="w-12 h-12 border-t-2 border-gold rounded-full animate-spin"></div>
                <p className="text-paper-muted text-[10px] uppercase tracking-[0.4em] font-black">Composition de votre édition...</p>
            </div>
        );
    }

    return (
        <main className="flex-1 overflow-y-auto bg-carbon scroll-smooth">
            <div className="max-w-[1400px] mx-auto px-12 py-16">
                {/* Header */}
                <header className="mb-20 space-y-4 border-b border-white/5 pb-10">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <p className="text-gold text-[10px] uppercase tracking-[0.5em] font-black">Édition du jour</p>
                            <h1 className="text-6xl font-serif italic text-paper-white tracking-tighter">
                                {selectedFeedId ? 'Archives du Flux' : 'La Une'}
                            </h1>
                        </div>
                        <div className="flex flex-col items-center gap-4 text-center">
                            <div className="flex flex-col items-center">
                                <p className="text-gold text-sm font-serif italic font-bold tracking-wide">
                                    {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                </p>
                                <p className="text-[10px] text-paper-muted opacity-80 uppercase tracking-[0.25em] font-black mt-1">
                                    Volume IX • No. 42
                                </p>
                            </div>
                            <button
                                onClick={() => refreshMutation.mutate()}
                                disabled={refreshMutation.isPending}
                                className={`text-[10px] uppercase tracking-[0.2em] font-bold px-6 py-2.5 rounded-full border border-gold/30 text-gold hover:bg-gold hover:text-carbon transition-all duration-300 ${refreshMutation.isPending ? 'animate-pulse opacity-50' : 'hover:shadow-lg hover:shadow-gold/20'}`}
                            >
                                {refreshMutation.isPending ? 'Mise à jour...' : 'Mettre à jour'}
                            </button>
                        </div>
                    </div>
                </header>

                {/* Grid */}
                {articles && articles.length > 0 ? (
                    <div className="magazine-grid">
                        {articles.map((article, index) => (
                            <div key={article.id} className={index % 6 === 0 ? 'md:col-span-2' : ''}>
                                <ArticleCard
                                    article={article}
                                    onClick={setSelectedArticle}
                                    onToggleRead={(id, is_read) => toggleReadMutation.mutate({ id, is_read })}
                                    onToggleFavorite={(id) => toggleFavoriteMutation.mutate(id)}
                                />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-40 border-2 border-dashed border-white/5 rounded-3xl">
                        <p className="text-paper-muted font-serif italic text-xl mb-4">Votre bibliothèque est vide.</p>
                        <p className="text-paper-muted/40 text-[10px] uppercase tracking-widest font-bold">Ajoutez un flux pour commencer votre lecture.</p>
                    </div>
                )}
            </div>

            {selectedArticle && (
                <ReaderView
                    article={selectedArticle}
                    onClose={() => setSelectedArticle(null)}
                    onToggleFavorite={(id) => toggleFavoriteMutation.mutate(id)}
                />
            )}
        </main>
    );
}
