import { useState, useEffect, useRef } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { articlesApi } from '../api/articles';
import { feedsApi } from '../api/feeds';
import { ArticleCard } from '../components/ArticleCard';
import { ReaderView } from '../components/ReaderView';
import { MobileReaderView } from '../components/MobileReaderView';
import { useWebsocket } from '../hooks/useWebsocket';
import type { Article } from '../api/articles';

interface DashboardPageProps {
    selectedFeedId: string | null;
}

const ITEMS_PER_PAGE = 24;

// Helper Hook for Responsive Split
function useIsMobile() {
    const [isMobile, setIsMobile] = useState(window.matchMedia('(max-width: 768px)').matches);

    useEffect(() => {
        const media = window.matchMedia('(max-width: 768px)');
        const listener = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        media.addEventListener('change', listener);
        return () => media.removeEventListener('change', listener);
    }, []);

    return isMobile;
}

export function DashboardPage({ selectedFeedId }: DashboardPageProps) {
    const queryClient = useQueryClient();
    const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const isMobile = useIsMobile();
    const loadMoreRef = useRef<HTMLDivElement>(null);

    // Debounce search query
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(searchQuery);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Real-time sync
    useWebsocket();

    const {
        data,
        isLoading,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage
    } = useInfiniteQuery({
        queryKey: ['articles', selectedFeedId, debouncedQuery],
        queryFn: ({ pageParam = 0 }) => {
            const options = {
                limit: ITEMS_PER_PAGE,
                offset: pageParam,
            };

            if (debouncedQuery) {
                return articlesApi.search(debouncedQuery, ITEMS_PER_PAGE, pageParam);
            }

            if (selectedFeedId === 'favorites') {
                return articlesApi.list({ ...options, favorite: true });
            }
            return articlesApi.list({ ...options, feed_id: selectedFeedId || undefined });
        },
        initialPageParam: 0,
        getNextPageParam: (lastPage, allPages) => {
            if (lastPage.length < ITEMS_PER_PAGE) return undefined;
            return allPages.length * ITEMS_PER_PAGE;
        },
    });

    const articles = data?.pages.flat() || [];

    // Intersection Observer for Infinite Scroll
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
                    fetchNextPage();
                }
            },
            { threshold: 0.1 }
        );

        if (loadMoreRef.current) {
            observer.observe(loadMoreRef.current);
        }

        return () => observer.disconnect();
    }, [hasNextPage, fetchNextPage, isFetchingNextPage]);

    const refreshMutation = useMutation({
        mutationFn: () => feedsApi.refresh(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['articles'] });
        },
    });

    const toggleReadMutation = useMutation({
        mutationFn: ({ id, is_read }: { id: string; is_read: boolean }) =>
            is_read ? articlesApi.markRead(id) : articlesApi.markUnread(id),
        onMutate: async ({ id, is_read }) => {
            const queryKey = ['articles', selectedFeedId, debouncedQuery];
            await queryClient.cancelQueries({ queryKey });
            const previousData = queryClient.getQueryData(queryKey);

            queryClient.setQueryData(queryKey, (old: any) => {
                if (!old) return old;
                return {
                    ...old,
                    pages: old.pages.map((page: Article[]) =>
                        page.map((article) =>
                            article.id === id ? { ...article, is_read: is_read } : article
                        )
                    ),
                };
            });

            return { previousData };
        },
        onError: (_err, _newTodo, context) => {
            const queryKey = ['articles', selectedFeedId, debouncedQuery];
            if (context?.previousData) {
                queryClient.setQueryData(queryKey, context.previousData);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['articles'] });
        },
    });

    const toggleFavoriteMutation = useMutation({
        mutationFn: articlesApi.toggleFavorite,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['articles'] }),
    });

    const [showScrollTop, setShowScrollTop] = useState(false);
    const mainRef = useRef<HTMLElement>(null);

    // Visibility logic for "Back to Top" button
    useEffect(() => {
        const handleScroll = (e: Event) => {
            const target = e.target as HTMLElement;
            setShowScrollTop(target.scrollTop > 1000);
        };
        const mainElement = mainRef.current;
        if (mainElement) {
            mainElement.addEventListener('scroll', handleScroll);
        }
        return () => mainElement?.removeEventListener('scroll', handleScroll);
    }, []);

    const scrollToTop = () => {
        mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    };

    if (isLoading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-carbon space-y-4">
                <div className="w-12 h-12 border-t-2 border-nature rounded-full animate-spin"></div>
                <p className="text-paper-muted text-[10px] uppercase tracking-[0.4em] font-black">Composition de votre édition...</p>
            </div>
        );
    }

    return (
        <main ref={mainRef} className="flex-1 overflow-y-auto bg-carbon scroll-smooth relative">
            {/* Back to Top Button */}
            <button
                onClick={scrollToTop}
                className={`fixed bottom-8 right-12 z-40 p-4 rounded-full bg-white border border-nature/10 text-nature shadow-2xl transition-all duration-500 hover:scale-110 active:scale-95 ${showScrollTop ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0 pointer-events-none'}`}
                title="Retour en haut"
            >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
            </button>

            <div className="max-w-[1400px] mx-auto px-12 py-16">
                {/* Header */}
                <header className="mb-20 space-y-12 border-b border-white/5 pb-10">
                    <div className="flex items-start justify-between">
                        <div className="space-y-1">
                            <p className="text-nature text-[10px] uppercase tracking-[0.5em] font-black">Édition du jour</p>
                            <h1 className="text-6xl font-serif italic text-paper-white tracking-tighter">
                                {debouncedQuery ? `Résultats : "${debouncedQuery}"` : selectedFeedId === 'favorites' ? 'Mes Favoris' : selectedFeedId ? 'Archives du Flux' : 'La Une'}
                            </h1>
                        </div>
                        <div className="flex flex-col items-end gap-6">
                            <div className="flex flex-col items-end text-right">
                                <p className="text-nature text-sm font-serif italic font-bold tracking-wide">
                                    {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                </p>
                                <p className="text-[10px] text-paper-muted opacity-80 uppercase tracking-[0.25em] font-black mt-1">
                                    Volume IX • No. 42
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-paper-muted/40 group-focus-within:text-nature transition-colors">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="RECHERCHER DANS L'ÉDITION..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-full text-[10px] text-paper-white placeholder-paper-muted/40 font-black tracking-widest focus:outline-none focus:ring-1 focus:ring-nature focus:border-nature transition-all w-48 focus:w-72"
                                    />
                                    {searchQuery && (
                                        <button
                                            onClick={() => setSearchQuery('')}
                                            className="absolute inset-y-0 right-3 flex items-center text-paper-muted hover:text-paper-white transition-colors"
                                        >
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                                <button
                                    onClick={() => refreshMutation.mutate()}
                                    disabled={refreshMutation.isPending}
                                    className={`text-[10px] uppercase tracking-[0.2em] font-bold px-6 py-2 rounded-full border border-nature/30 text-nature hover:bg-nature hover:text-white hover:border-nature transition-all duration-300 ${refreshMutation.isPending ? 'animate-pulse opacity-50' : 'hover:shadow-lg hover:shadow-nature/20'}`}
                                >
                                    {refreshMutation.isPending ? 'Mise à jour' : 'Actualiser'}
                                </button>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Grid */}
                {articles.length > 0 ? (
                    <>
                        <div className="magazine-grid">
                            {articles.map((article, index) => (
                                <div key={`${article.id}-${index}`} className={index % 6 === 0 ? 'md:col-span-2' : ''}>
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

                        {/* Infinite Scroll Sentinel */}
                        <div ref={loadMoreRef} className="mt-20 py-10 flex flex-col items-center justify-center space-y-4">
                            {isFetchingNextPage ? (
                                <>
                                    <div className="w-8 h-8 border-t-2 border-nature rounded-full animate-spin"></div>
                                    <p className="text-nature text-[8px] uppercase tracking-[0.4em] font-black">Chargement supplémentaire...</p>
                                </>
                            ) : hasNextPage ? (
                                <p className="text-paper-muted/20 text-[8px] uppercase tracking-[0.4em] font-black italic">Défilez pour découvrir la suite</p>
                            ) : (
                                <div className="flex flex-col items-center space-y-2">
                                    <div className="h-[1px] w-20 bg-nature/20"></div>
                                    <p className="text-paper-muted/40 text-[8px] uppercase tracking-[0.4em] font-black">Fin de votre édition</p>
                                    <div className="h-[1px] w-20 bg-nature/20"></div>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center py-40 border-2 border-dashed border-white/5 rounded-3xl">
                        <p className="text-paper-muted font-serif italic text-xl mb-4">
                            {debouncedQuery ? `Aucun article ne correspond à "${debouncedQuery}".` : 'Votre bibliothèque est vide.'}
                        </p>
                        <p className="text-paper-muted/40 text-[10px] uppercase tracking-widest font-bold">
                            {debouncedQuery ? "Tentez une recherche plus large." : "Ajoutez un flux pour commencer votre lecture."}
                        </p>
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
                            } else if (hasNextPage) {
                                fetchNextPage();
                            } else {
                                setSelectedArticle(null);
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
