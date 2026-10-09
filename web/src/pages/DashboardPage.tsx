import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { articlesApi, cursorAfter, type Article } from '../api/articles';
import { feedsApi } from '../api/feeds';
import { ArticleCard } from '../components/ArticleCard';
import { Reader } from '../components/reader/Reader';
import { ShortcutsHelp } from '../components/ShortcutsHelp';
import { findCachedArticle, useArticleActions } from '../hooks/useArticleActions';
import { useLive } from '../hooks/useWebsocket';
import { prefersReducedMotion } from '../hooks/useIsMobile';
import { usePrefs } from '../stores/prefsStore';

const PAGE_SIZE = 30;

interface DashboardPageProps {
    selectedFeedId: string | null;
    /** Hidden (kept mounted) while focus mode is shown, to preserve scroll. */
    hidden?: boolean;
}

function isTypingTarget(t: EventTarget | null) {
    const el = t as HTMLElement | null;
    return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

export function DashboardPage({ selectedFeedId, hidden }: DashboardPageProps) {
    const qc = useQueryClient();
    const [params, setParams] = useSearchParams();
    const [showHelp, setShowHelp] = useState(false);
    const mainRef = useRef<HTMLElement>(null);
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const [showScrollTop, setShowScrollTop] = useState(false);

    const unreadPref = usePrefs((s) => s.unreadOnly);
    const setUnreadOnly = usePrefs((s) => s.setUnreadOnly);
    const newCount = useLive((s) => s.newCount);
    const clearNew = useLive((s) => s.clearNew);
    const { setRead, toggleRead, toggleFavorite } = useArticleActions();

    const favorites = selectedFeedId === 'favorites';
    const feedId = favorites ? null : selectedFeedId;
    const unreadOnly = unreadPref && !favorites;

    const listKey = useMemo(
        () => ['articles', { feedId, favorites, unread: unreadOnly }] as const,
        [feedId, favorites, unreadOnly],
    );

    const { data, isPending, isError, refetch, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage, isPlaceholderData } =
        useInfiniteQuery({
            queryKey: listKey,
            queryFn: ({ pageParam }) =>
                articlesApi.list({ limit: PAGE_SIZE, cursor: pageParam || undefined, unread: unreadOnly, favorites, feedId }),
            initialPageParam: '' as string,
            getNextPageParam: (last) => (last.length < PAGE_SIZE ? undefined : cursorAfter(last[last.length - 1])),
            // Keep showing the previous list while another feed or filter loads.
            placeholderData: keepPreviousData,
        });

    const articles = useMemo(() => data?.pages.flat() ?? [], [data]);

    const { data: feeds } = useQuery({ queryKey: ['feeds'], queryFn: () => feedsApi.list() });
    const unreadTotal = useMemo(() => {
        if (!feeds) return 0;
        if (feedId) return feeds.find((f) => f.id === feedId)?.unread_count ?? 0;
        return feeds.reduce((n, f) => n + (f.unread_count ?? 0), 0);
    }, [feeds, feedId]);

    // ---------- Reader state lives in the URL (?a=<id>) so Back closes it ----------
    const openId = params.get('a');
    const openIndex = openId ? articles.findIndex((a) => a.id === openId) : -1;
    const deepLinked = useQuery({
        queryKey: ['article', openId],
        queryFn: () => articlesApi.get(openId!),
        enabled: !!openId && openIndex === -1 && !findCachedArticle(qc, openId),
    });
    const openArticle: Article | undefined =
        openIndex >= 0 ? articles[openIndex] : openId ? (findCachedArticle(qc, openId) ?? deepLinked.data) : undefined;

    const openReader = useCallback(
        (a: Article, replace = false) => {
            if (!a.is_read) setRead(a, true);
            setParams(
                (p) => {
                    const n = new URLSearchParams(p);
                    n.set('a', a.id);
                    return n;
                },
                { replace, state: { reader: true } },
            );
        },
        [setParams, setRead],
    );

    const closeReader = useCallback(() => {
        if ((window.history.state?.usr as { reader?: boolean } | undefined)?.reader) {
            window.history.back();
        } else {
            setParams((p) => {
                const n = new URLSearchParams(p);
                n.delete('a');
                return n;
            }, { replace: true });
        }
    }, [setParams]);

    const goNext = useCallback(async () => {
        if (openIndex < 0) return;
        if (openIndex + 1 < articles.length) {
            openReader(articles[openIndex + 1], true);
        } else if (hasNextPage) {
            const res = await fetchNextPage();
            const all = res.data?.pages.flat() ?? [];
            if (all[openIndex + 1]) openReader(all[openIndex + 1], true);
        } else {
            closeReader();
        }
    }, [openIndex, articles, hasNextPage, fetchNextPage, openReader, closeReader]);

    const goPrev = useCallback(() => {
        if (openIndex > 0) openReader(articles[openIndex - 1], true);
    }, [openIndex, articles, openReader]);

    // ---------- Infinite scroll (prefetch well before the end) ----------
    useEffect(() => {
        const target = loadMoreRef.current;
        if (!target) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
            },
            { root: mainRef.current, rootMargin: '0px 0px 1200px 0px' },
        );
        observer.observe(target);
        return () => observer.disconnect();
    }, [hasNextPage, fetchNextPage, isFetchingNextPage]);

    useEffect(() => {
        const el = mainRef.current;
        if (!el) return;
        const onScroll = () => setShowScrollTop(el.scrollTop > 900);
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, []);

    const scrollTop = () => mainRef.current?.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });

    const refreshMutation = useMutation({ mutationFn: () => feedsApi.refresh() });

    const markAllMutation = useMutation({
        mutationFn: () => (feedId ? articlesApi.markAllRead(feedId) : articlesApi.markAllReadGlobal()),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['articles'] });
            qc.invalidateQueries({ queryKey: ['feeds'] });
        },
    });

    const showNew = () => {
        clearNew();
        qc.invalidateQueries({ queryKey: ['articles'] });
        scrollTop();
    };

    // ---------- Keyboard navigation on the list ----------
    useEffect(() => {
        if (hidden || openId) return;
        const cardAt = (i: number) => mainRef.current?.querySelector<HTMLElement>(`[data-index="${i}"] h2 button`);
        const currentIndex = () => {
            const el = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-index]');
            return el ? Number(el.dataset.index) : -1;
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
            const i = currentIndex();
            const current = i >= 0 ? articles[i] : undefined;
            switch (e.key) {
                case 'j':
                case 'n': {
                    const next = Math.min(articles.length - 1, i + 1);
                    cardAt(next)?.focus();
                    cardAt(next)?.scrollIntoView({ block: 'nearest' });
                    if (next >= articles.length - 3 && hasNextPage) fetchNextPage();
                    break;
                }
                case 'k':
                case 'p': {
                    const prev = Math.max(0, i - 1);
                    cardAt(prev)?.focus();
                    cardAt(prev)?.scrollIntoView({ block: 'nearest' });
                    break;
                }
                case 'o':
                    if (current) openReader(current);
                    break;
                case 'm':
                    if (current) toggleRead(current);
                    break;
                case 's':
                case 'f':
                    if (current) toggleFavorite(current);
                    break;
                case 'v':
                    if (current?.url) window.open(current.url, '_blank', 'noopener,noreferrer');
                    break;
                case 'u':
                    setUnreadOnly(!unreadPref);
                    break;
                case 'r':
                    refreshMutation.mutate();
                    break;
                case '?':
                    setShowHelp(true);
                    break;
                default:
                    return;
            }
            e.preventDefault();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [hidden, openId, articles, hasNextPage, fetchNextPage, openReader, toggleRead, toggleFavorite, setUnreadOnly, unreadPref, refreshMutation]);


    return (
        <main ref={mainRef} className={`flex-1 overflow-y-auto bg-carbon relative ${hidden ? 'hidden' : ''}`} aria-busy={isFetching}>
            <div className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-12 py-6 md:py-8">
                {/* The page title is the feed selector in the top bar. */}
                <div className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                    <p className="text-paper-muted text-sm" aria-live="polite">
                        {favorites
                            ? `${articles.length}${hasNextPage ? '+' : ''} favori${articles.length > 1 ? 's' : ''}`
                            : unreadTotal === 0
                                ? 'Tout est lu'
                                : `${unreadTotal} article${unreadTotal > 1 ? 's' : ''} non lu${unreadTotal > 1 ? 's' : ''}`}
                    </p>

                    <div className="flex items-center gap-2">
                        {!favorites && (
                            <div className="segmented" role="group" aria-label="Articles affichés">
                                <button aria-pressed={unreadPref} onClick={() => setUnreadOnly(true)}>Non lus</button>
                                <button aria-pressed={!unreadPref} onClick={() => setUnreadOnly(false)}>Tous</button>
                            </div>
                        )}
                        <button
                            onClick={() => refreshMutation.mutate()}
                            disabled={refreshMutation.isPending}
                            className="icon-btn"
                            title="Actualiser les flux (r)"
                            aria-label="Actualiser les flux"
                        >
                            <svg className={`w-4 h-4 ${refreshMutation.isPending ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                        {!favorites && unreadTotal > 0 && (
                            <button
                                onClick={() => {
                                    if (window.confirm(`Marquer ${unreadTotal} article${unreadTotal > 1 ? 's' : ''} comme lu${unreadTotal > 1 ? 's' : ''} ?`)) {
                                        markAllMutation.mutate();
                                    }
                                }}
                                disabled={markAllMutation.isPending}
                                className="icon-btn"
                                title="Tout marquer comme lu"
                                aria-label="Tout marquer comme lu"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 13l4 4L16 7m-4 10l1 1L22 7" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>

                {/* New articles are announced, never inserted under the reader's eyes */}
                {newCount > 0 && (
                    <div className="sticky top-3 z-30 flex justify-center mb-6 pointer-events-none">
                        <button onClick={showNew} className="btn-primary pointer-events-auto shadow-lg normal-case tracking-normal text-sm">
                            Afficher {newCount} nouvel{newCount > 1 ? 's' : ''} article{newCount > 1 ? 's' : ''}
                        </button>
                    </div>
                )}

                {/* Grid */}
                {isPending ? (
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3" aria-label="Chargement des articles" role="status">
                        {Array.from({ length: 6 }, (_, i) => (
                            <div key={i} className="rounded-2xl bg-carbon-light border border-paper-muted/10 overflow-hidden">
                                <div className="aspect-[16/9] bg-carbon-dark animate-pulse" />
                                <div className="p-5 space-y-3">
                                    <div className="h-5 w-4/5 rounded bg-carbon-dark animate-pulse" />
                                    <div className="h-4 w-full rounded bg-carbon-dark animate-pulse" />
                                    <div className="h-4 w-2/3 rounded bg-carbon-dark animate-pulse" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : isError && articles.length === 0 ? (
                    <div role="alert" className="flex flex-col items-center justify-center py-24 border border-dashed border-paper-muted/25 rounded-3xl text-center px-6 gap-4">
                        <p className="text-paper-white font-serif text-xl">
                            {navigator.onLine ? 'Impossible de charger vos articles.' : 'Vous êtes hors ligne.'}
                        </p>
                        <button onClick={() => refetch()} className="btn-secondary">Réessayer</button>
                    </div>
                ) : articles.length > 0 ? (
                    <>
                        <div
                            className={`grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3 transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}
                        >
                            {articles.map((article, i) => (
                                <ArticleCard
                                    key={article.id}
                                    index={i}
                                    article={article}
                                    onOpen={openReader}
                                    onToggleRead={toggleRead}
                                    onToggleFavorite={toggleFavorite}
                                />
                            ))}
                        </div>

                        <div ref={loadMoreRef} className="mt-14 py-8 flex flex-col items-center gap-3">
                            {isFetchingNextPage ? (
                                <div className="w-7 h-7 border-2 border-nature/20 border-t-nature rounded-full animate-spin" role="status" aria-label="Chargement" />
                            ) : !hasNextPage ? (
                                <div className="flex items-center gap-3">
                                    <span className="h-px w-16 bg-nature/25" />
                                    <p className="text-sm text-paper-muted">Fin de la liste</p>
                                    <span className="h-px w-16 bg-nature/25" />
                                </div>
                            ) : null}
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center py-24 border border-dashed border-paper-muted/25 rounded-3xl text-center px-6 gap-3">
                        <p className="text-paper-white font-serif text-2xl">
                            {favorites
                                ? 'Aucun favori'
                                : unreadOnly && (feeds?.length ?? 0) > 0
                                    ? 'Tout est lu'
                                    : 'Aucun article'}
                        </p>
                        <p className="text-paper-muted text-sm">
                            {favorites
                                ? 'Touchez l’étoile d’un article pour le retrouver ici.'
                                : unreadOnly && (feeds?.length ?? 0) > 0
                                    ? 'Les nouveaux articles apparaîtront ici.'
                                    : 'Ajoutez un flux avec le bouton +.'}
                        </p>
                        {unreadOnly && (feeds?.length ?? 0) > 0 && (
                            <button onClick={() => setUnreadOnly(false)} className="btn-secondary mt-2">Voir tous les articles</button>
                        )}
                    </div>
                )}
            </div>

            {/* Back to top */}
            <button
                onClick={scrollTop}
                className={`fixed bottom-6 right-6 z-40 icon-btn !w-12 !h-12 bg-carbon-light shadow-lg transition-all duration-300 ${
                    showScrollTop ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0 pointer-events-none'
                }`}
                aria-label="Retour en haut"
                tabIndex={showScrollTop ? 0 : -1}
            >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
            </button>

            {openArticle && !hidden && (
                <Reader
                    key={openArticle.id}
                    article={openArticle}
                    next={openIndex >= 0 ? articles[openIndex + 1] : undefined}
                    hasPrev={openIndex > 0}
                    onClose={closeReader}
                    onNext={openIndex >= 0 && (openIndex + 1 < articles.length || hasNextPage) ? goNext : undefined}
                    onPrev={goPrev}
                />
            )}

            {showHelp && <ShortcutsHelp onClose={() => setShowHelp(false)} />}
        </main>
    );
}
