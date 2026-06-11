import { useState, useEffect, useRef, useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Masonry from 'react-masonry-css';
import { articlesApi } from '../api/articles';
import { feedsApi } from '../api/feeds';
import { ArticleCard } from '../components/ArticleCard';
import { ReaderView } from '../components/ReaderView';
import { MobileReaderView } from '../components/MobileReaderView';
import { useIsMobile } from '../hooks/useIsMobile';
import { useWebsocket } from '../hooks/useWebsocket';
import type { Article } from '../api/articles';

const breakpointColumnsObj = { default: 3, 1100: 2, 700: 1 };
const ITEMS_PER_PAGE = 24;

interface DashboardPageProps {
    selectedFeedId: string | null;
    onEnterFocus: () => void;
}

type ArticlePages = { pages: Article[][] };

function timestamp(a: Article): number {
    return new Date(a.published_at || a.created_at).getTime();
}

export function DashboardPage({ selectedFeedId, onEnterFocus }: DashboardPageProps) {
    const queryClient = useQueryClient();
    const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const isMobile = useIsMobile();
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const mainRef = useRef<HTMLElement>(null);
    const [showScrollTop, setShowScrollTop] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(searchQuery), 400);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    useWebsocket();

    const queryKey = ['articles', selectedFeedId, debouncedQuery];

    const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
        queryKey,
        queryFn: ({ pageParam = 0 }) => {
            const options = { limit: ITEMS_PER_PAGE, offset: pageParam };
            if (debouncedQuery) return articlesApi.search(debouncedQuery, ITEMS_PER_PAGE, pageParam);
            if (selectedFeedId === 'favorites') return articlesApi.list({ ...options, favorite: true });
            return articlesApi.list({ ...options, feed_id: selectedFeedId || undefined });
        },
        initialPageParam: 0,
        getNextPageParam: (lastPage, allPages) =>
            lastPage.length < ITEMS_PER_PAGE ? undefined : allPages.length * ITEMS_PER_PAGE,
    });

    const sortedArticles = useMemo(() => {
        const all = data?.pages.flat() ?? [];
        return [...all].sort((a, b) => {
            if (a.is_read !== b.is_read) return a.is_read ? 1 : -1;
            return timestamp(b) - timestamp(a);
        });
    }, [data]);

    const unreadCount = useMemo(() => sortedArticles.filter((a) => !a.is_read).length, [sortedArticles]);

    // Infinite scroll
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
            },
            { threshold: 0.1 }
        );
        if (loadMoreRef.current) observer.observe(loadMoreRef.current);
        return () => observer.disconnect();
    }, [hasNextPage, fetchNextPage, isFetchingNextPage]);

    // Back-to-top visibility
    useEffect(() => {
        const el = mainRef.current;
        if (!el) return;
        const onScroll = () => setShowScrollTop(el.scrollTop > 900);
        el.addEventListener('scroll', onScroll);
        return () => el.removeEventListener('scroll', onScroll);
    }, []);

    const refreshMutation = useMutation({
        mutationFn: () => feedsApi.refresh(),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['articles'] }),
    });

    const toggleReadMutation = useMutation({
        mutationFn: ({ id, is_read }: { id: string; is_read: boolean }) =>
            is_read ? articlesApi.markRead(id) : articlesApi.markUnread(id),
        onMutate: async ({ id, is_read }) => {
            await queryClient.cancelQueries({ queryKey });
            const previousData = queryClient.getQueryData(queryKey);
            queryClient.setQueryData(queryKey, (old: ArticlePages | undefined) => {
                if (!old) return old;
                return {
                    ...old,
                    pages: old.pages.map((page) => page.map((a) => (a.id === id ? { ...a, is_read } : a))),
                };
            });
            return { previousData };
        },
        onError: (_e, _v, context) => {
            if (context?.previousData) queryClient.setQueryData(queryKey, context.previousData);
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['articles'] }),
    });

    const toggleFavoriteMutation = useMutation({
        mutationFn: articlesApi.toggleFavorite,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['articles'] }),
    });

    const heading = debouncedQuery
        ? `Résultats : « ${debouncedQuery} »`
        : selectedFeedId === 'favorites'
            ? 'Mes favoris'
            : selectedFeedId
                ? 'Archives du flux'
                : 'La Une';

    if (isLoading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-carbon">
                <div className="w-11 h-11 border-2 border-nature/20 border-t-nature rounded-full animate-spin" />
                <p className="eyebrow text-paper-muted">Composition de votre édition…</p>
            </div>
        );
    }

    return (
        <main ref={mainRef} className="flex-1 overflow-y-auto bg-carbon relative">
            {/* Back to top */}
            <button
                onClick={() => mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                className={`fixed bottom-8 right-8 z-40 icon-btn w-12 h-12 bg-carbon-light shadow-lg transition-all duration-300 ${
                    showScrollTop ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0 pointer-events-none'
                }`}
                title="Retour en haut"
                aria-label="Retour en haut"
            >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
            </button>

            <div className="max-w-[1400px] mx-auto px-6 md:px-12 py-10 md:py-14">
                {/* Masthead */}
                <header className="mb-12 border-b border-paper-muted/15 pb-8">
                    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
                        <div>
                            <p className="eyebrow mb-2">Édition du jour</p>
                            <h1 className="text-5xl md:text-6xl font-serif italic text-paper-white tracking-tight text-balance">
                                {heading}
                            </h1>
                            <p className="text-paper-muted text-sm mt-3 font-reading">
                                {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                {unreadCount > 0 && <span className="text-nature"> · {unreadCount} non lus</span>}
                            </p>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="relative group">
                                <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-paper-muted/50 group-focus-within:text-nature transition-colors">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </span>
                                <input
                                    type="search"
                                    aria-label="Rechercher dans l'édition"
                                    placeholder="Rechercher…"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="input-field pl-10 pr-4 py-2.5 rounded-full w-44 focus:w-64 transition-all text-sm"
                                />
                            </div>
                            <button
                                onClick={() => refreshMutation.mutate()}
                                disabled={refreshMutation.isPending}
                                className="btn-secondary"
                            >
                                <svg className={`w-3.5 h-3.5 ${refreshMutation.isPending ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                {refreshMutation.isPending ? 'Mise à jour' : 'Actualiser'}
                            </button>
                        </div>
                    </div>
                </header>

                {/* Focus CTA */}
                {!selectedFeedId && !debouncedQuery && unreadCount > 0 && (
                    <button
                        onClick={onEnterFocus}
                        className="group w-full mb-10 relative overflow-hidden rounded-2xl bg-nature text-white flex items-center justify-between p-6 text-left transition-transform hover:scale-[1.005]"
                    >
                        <span className="absolute -top-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
                        <span className="relative z-10">
                            <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-white/70">Mode Focus</span>
                            <span className="block text-2xl font-serif italic mt-1">Votre session de lecture</span>
                            <span className="block text-white/80 text-sm mt-1">{unreadCount} articles non lus à trier d'un geste.</span>
                        </span>
                        <span className="relative z-10 btn-primary bg-white !text-nature group-hover:!bg-white/90">
                            Lancer
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                        </span>
                    </button>
                )}

                {/* Grid */}
                {sortedArticles.length > 0 ? (
                    <>
                        <Masonry breakpointCols={breakpointColumnsObj} className="flex w-auto -ml-6" columnClassName="pl-6 bg-clip-padding">
                            {sortedArticles.map((article) => (
                                <div key={article.id} className="mb-6">
                                    <ArticleCard
                                        article={article}
                                        onClick={(a) => {
                                            setSelectedArticle(a);
                                            if (!a.is_read) toggleReadMutation.mutate({ id: a.id, is_read: true });
                                        }}
                                        onToggleRead={(id, is_read) => toggleReadMutation.mutate({ id, is_read })}
                                        onToggleFavorite={(id) => toggleFavoriteMutation.mutate(id)}
                                    />
                                </div>
                            ))}
                        </Masonry>

                        <div ref={loadMoreRef} className="mt-16 py-8 flex flex-col items-center gap-3">
                            {isFetchingNextPage ? (
                                <>
                                    <div className="w-7 h-7 border-2 border-nature/20 border-t-nature rounded-full animate-spin" />
                                    <p className="eyebrow text-paper-muted/60">Chargement…</p>
                                </>
                            ) : hasNextPage ? (
                                <p className="text-paper-muted/40 text-[10px] uppercase tracking-[0.3em] font-bold">Défilez pour la suite</p>
                            ) : (
                                <div className="flex items-center gap-3">
                                    <span className="h-px w-16 bg-nature/20" />
                                    <p className="eyebrow text-paper-muted/50">Fin de l'édition</p>
                                    <span className="h-px w-16 bg-nature/20" />
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center py-32 border border-dashed border-paper-muted/20 rounded-3xl text-center px-6">
                        <p className="text-paper-muted font-serif italic text-xl mb-2">
                            {debouncedQuery ? `Aucun article pour « ${debouncedQuery} ».` : 'Votre bibliothèque est vide.'}
                        </p>
                        <p className="eyebrow text-paper-muted/50">
                            {debouncedQuery ? 'Tentez une recherche plus large.' : 'Ajoutez un flux pour commencer.'}
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
                            const idx = sortedArticles.findIndex((a) => a.id === selectedArticle.id);
                            if (idx < sortedArticles.length - 1) {
                                const next = sortedArticles[idx + 1];
                                setSelectedArticle(next);
                                if (!next.is_read) toggleReadMutation.mutate({ id: next.id, is_read: true });
                            } else if (hasNextPage) {
                                fetchNextPage();
                            } else {
                                setSelectedArticle(null);
                            }
                        }}
                        onPrev={() => {
                            const idx = sortedArticles.findIndex((a) => a.id === selectedArticle.id);
                            if (idx > 0) setSelectedArticle(sortedArticles[idx - 1]);
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
