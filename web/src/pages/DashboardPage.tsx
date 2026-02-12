import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { articlesApi } from '../api/articles';
import { feedsApi } from '../api/feeds';
import { ArticleCard } from '../components/ArticleCard';
import { ReaderView } from '../components/ReaderView';
import { MobileReaderView } from '../components/MobileReaderView';
import { useWebsocket } from '../hooks/useWebsocket';
import { useEffect } from 'react';
import type { Article } from '../api/articles';

interface DashboardPageProps {
    selectedFeedId: string | null;
    onEnterFocus: () => void;
}

// Helper Hook for Responsive Split
function useIsMobile() {
    const [isMobile, setIsMobile] = useState(window.matchMedia('(max-width: 768px)').matches);

    useEffect(() => {
        const media = window.matchMedia('(max-width: 768px)');
        const listener = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        media.addEventListener('change', listener); // Modern browsers support this
        return () => media.removeEventListener('change', listener);
    }, []);

    return isMobile;
}

export function DashboardPage({ selectedFeedId, onEnterFocus }: DashboardPageProps) {
    const queryClient = useQueryClient();
    const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
    const isMobile = useIsMobile();

    // Real-time sync
    useWebsocket();

    const { data: articles, isLoading } = useQuery({
        queryKey: ['articles', selectedFeedId],
        queryFn: () => {
            if (selectedFeedId === 'favorites') {
                return articlesApi.list({ favorite: true });
            }
            return articlesApi.list({ feed_id: selectedFeedId || undefined });
        },
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
        onMutate: async ({ id, is_read }) => {
            // Cancel outgoing refetches
            await queryClient.cancelQueries({ queryKey: ['articles'] });

            // Snapshot previous value
            const previousArticles = queryClient.getQueryData(['articles', selectedFeedId]);

            // Optimistically update
            queryClient.setQueryData(['articles', selectedFeedId], (old: Article[] | undefined) => {
                if (!old) return old;
                return old.map((article) =>
                    article.id === id ? { ...article, is_read: is_read } : article
                );
            });

            return { previousArticles };
        },
        onError: (_err, _newTodo, context) => {
            // Rollback on error
            if (context?.previousArticles) {
                queryClient.setQueryData(['articles', selectedFeedId], context.previousArticles);
            }
        },
        onSuccess: () => {
            // Refetch to be safe (but optimistic update makes it instant)
            queryClient.invalidateQueries({ queryKey: ['articles'] });
        },
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
                                {selectedFeedId === 'favorites' ? 'Mes Favoris' : selectedFeedId ? 'Archives du Flux' : 'La Une'}
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
                                className={`text-[10px] uppercase tracking-[0.2em] font-bold px-6 py-2.5 rounded-full border border-gold/30 text-gold hover:bg-nature hover:text-white hover:border-nature transition-all duration-300 ${refreshMutation.isPending ? 'animate-pulse opacity-50' : 'hover:shadow-lg hover:shadow-nature/20'}`}
                            >
                                {refreshMutation.isPending ? 'Mise à jour...' : 'Mettre à jour'}
                            </button>
                        </div>
                    </div>
                </header>

                {/* Focus Mode CTA Widget */}
                {!selectedFeedId && articles && articles.length > 0 && (
                    <div className="mb-16 relative overflow-hidden rounded-2xl bg-gradient-to-r from-nature to-nature-light shadow-2xl items-center flex flex-col md:flex-row p-8 md:p-12 hover:scale-[1.01] transition-transform cursor-pointer group" onClick={onEnterFocus}>
                        {/* decorative circles */}
                        <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-colors pointer-events-none"></div>
                        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-black/10 rounded-full blur-3xl pointer-events-none"></div>

                        <div className="flex-1 z-10 text-center md:text-left mb-6 md:mb-0">
                            <div className="flex items-center justify-center md:justify-start space-x-2 mb-2">
                                <span className="bg-white/20 text-white text-[10px] font-bold px-2 py-1 rounded uppercase tracking-widest backdrop-blur-sm">
                                    Nouveauté
                                </span>
                            </div>
                            <h2 className="text-3xl md:text-4xl font-serif italic text-white mb-2 text-shadow-sm">
                                Votre session de lecture
                            </h2>
                            <p className="text-white/80 font-medium text-sm md:text-base max-w-xl">
                                {articles.filter(a => !a.is_read).length} articles non lus vous attendent. Passez en mode Focus pour une lecture fluide et sans distraction.
                            </p>
                        </div>

                        <div className="z-10">
                            <button
                                onClick={(e) => { e.stopPropagation(); onEnterFocus(); }}
                                className="bg-white text-nature font-bold text-sm uppercase tracking-widest px-8 py-4 rounded-full shadow-lg hover:bg-gray-50 hover:shadow-xl hover:scale-105 transition-all flex items-center"
                            >
                                Lancer le Mode Focus
                                <svg className="w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                </svg>
                            </button>
                        </div>
                    </div>
                )}

                {/* Grid */}
                {articles && articles.length > 0 ? (
                    <div className="magazine-grid">
                        {articles.map((article, index) => (
                            <div key={article.id} className={index % 6 === 0 ? 'md:col-span-2' : ''}>
                                <ArticleCard
                                    article={article}
                                    onClick={(article) => {
                                        setSelectedArticle(article);
                                        if (!article.is_read) {
                                            toggleReadMutation.mutate({ id: article.id, is_read: true });
                                        }
                                    }}
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
                isMobile ? (
                    <MobileReaderView
                        article={selectedArticle}
                        onClose={() => setSelectedArticle(null)}
                        onToggleFavorite={(id) => toggleFavoriteMutation.mutate(id)}
                        onNext={() => {
                            if (!articles) return;
                            const idx = articles.findIndex(a => a.id === selectedArticle.id);
                            if (idx < articles.length - 1) {
                                const nextArticle = articles[idx + 1];
                                setSelectedArticle(nextArticle);
                                if (!nextArticle.is_read) {
                                    toggleReadMutation.mutate({ id: nextArticle.id, is_read: true });
                                }
                            } else {
                                // End of list feedback?
                                setSelectedArticle(null); // Close for now or loop? Closing feels right for "Done".
                            }
                        }}
                        onPrev={() => {
                            if (!articles) return;
                            const idx = articles.findIndex(a => a.id === selectedArticle.id);
                            if (idx > 0) {
                                const prevArticle = articles[idx - 1];
                                setSelectedArticle(prevArticle);
                            }
                        }}
                    />
                ) : (
                    <ReaderView
                        article={selectedArticle}
                        onClose={() => setSelectedArticle(null)}
                        onToggleFavorite={(id) => toggleFavoriteMutation.mutate(id)}
                    />
                )
            )}
        </main>
    );
}
