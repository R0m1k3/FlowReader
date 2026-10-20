import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { articlesApi, cursorAfter, type Article } from '../api/articles';
import { feedsApi } from '../api/feeds';
import { ArticleCard } from '../components/ArticleCard';
import { ArticleRow } from '../components/ArticleRow';
import { Reader } from '../components/reader/Reader';
import { Icon } from '../components/Icon';
import { findCachedArticle, useArticleActions } from '../hooks/useArticleActions';
import { useLive } from '../hooks/useWebsocket';
import { prefersReducedMotion, useIsMobile } from '../hooks/useIsMobile';
import { useFeeds, useScopeLabel } from '../hooks/useFeeds';
import { onMenuKeyDown, useDismiss } from '../hooks/useDismiss';
import { usePrefs } from '../stores/prefsStore';
import { useUI } from '../stores/uiStore';

const PAGE_SIZE = 30;

interface DashboardPageProps {
    /** Hidden (kept mounted) while focus mode or the feeds tab is shown, to preserve scroll. */
    hidden?: boolean;
}

function isTypingTarget(t: EventTarget | null) {
    const el = t as HTMLElement | null;
    return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

/**
 * The article list and the reader. Desktop and tablet in list view: the list
 * column with the reader pane beside it. Phones and the magazine view: the
 * list alone, the reader opening above it.
 */
export function DashboardPage({ hidden }: DashboardPageProps) {
    const qc = useQueryClient();
    const [params, setParams] = useSearchParams();
    const listRef = useRef<HTMLElement>(null);
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const [showScrollTop, setShowScrollTop] = useState(false);
    const isMobile = useIsMobile();

    const scope = useUI((s) => s.scope);
    const setDrawerOpen = useUI((s) => s.setDrawerOpen);
    const setSearchOpen = useUI((s) => s.setSearchOpen);
    const openDialog = useUI((s) => s.openDialog);
    const label = useScopeLabel(scope);
    const unreadPref = usePrefs((s) => s.unreadOnly);
    const setUnreadOnly = usePrefs((s) => s.setUnreadOnly);
    const view = usePrefs((s) => s.view);
    const setView = usePrefs((s) => s.setView);
    const newCount = useLive((s) => s.newCount);
    const clearNew = useLive((s) => s.clearNew);
    const { setRead, toggleRead, toggleFavorite } = useArticleActions();

    const favorites = scope === 'favorites';
    const feedId = favorites ? null : scope;
    const unreadOnly = unreadPref && !favorites;
    const paneMode = !isMobile && view === 'list';

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

    const { data: feeds } = useFeeds();
    const unreadTotal = useMemo(() => {
        if (!feeds) return 0;
        if (feedId) return feeds.find((f) => f.id === feedId)?.unread_count ?? 0;
        return feeds.reduce((n, f) => n + (f.unread_count ?? 0), 0);
    }, [feeds, feedId]);
    const currentFeed = feedId ? feeds?.find((f) => f.id === feedId) : undefined;

    // A new scope or layout starts at the top of its list, with the reader
    // closed (an article from another list must not pop up over this one).
    const shown = useRef({ scope, view });
    useEffect(() => {
        if (shown.current.scope === scope && shown.current.view === view) return;
        shown.current = { scope, view };
        listRef.current?.scrollTo({ top: 0 });
        setParams(
            (p) => {
                if (!p.has('a')) return p;
                const n = new URLSearchParams(p);
                n.delete('a');
                return n;
            },
            { replace: true },
        );
    }, [scope, view, setParams]);

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

    // Keep the open article visible in the list column.
    useEffect(() => {
        if (!paneMode || openIndex < 0) return;
        listRef.current?.querySelector(`[data-index="${openIndex}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [paneMode, openIndex]);

    // ---------- Infinite scroll (prefetch well before the end) ----------
    useEffect(() => {
        const target = loadMoreRef.current;
        if (!target) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
            },
            { root: listRef.current, rootMargin: '0px 0px 1200px 0px' },
        );
        observer.observe(target);
        return () => observer.disconnect();
    }, [hasNextPage, fetchNextPage, isFetchingNextPage]);

    useEffect(() => {
        const el = listRef.current;
        if (!el) return;
        const onScroll = () => setShowScrollTop(el.scrollTop > 900);
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, []);

    const scrollTop = () => listRef.current?.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });

    const refreshMutation = useMutation({ mutationFn: () => feedsApi.refresh() });

    const markAllMutation = useMutation({
        mutationFn: () => (feedId ? articlesApi.markAllRead(feedId) : articlesApi.markAllReadGlobal()),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['articles'] });
            qc.invalidateQueries({ queryKey: ['feeds'] });
        },
    });
    const markAll = () => {
        if (window.confirm(`Marquer ${unreadTotal} article${unreadTotal > 1 ? 's' : ''} comme lu${unreadTotal > 1 ? 's' : ''} ?`)) {
            markAllMutation.mutate();
        }
    };

    const showNew = () => {
        clearNew();
        qc.invalidateQueries({ queryKey: ['articles'] });
        scrollTop();
    };

    // ---------- Keyboard navigation on the list (the reader handles its own) ----------
    useEffect(() => {
        if (hidden || openId) return;
        const cardAt = (i: number) => listRef.current?.querySelector<HTMLElement>(`[data-index="${i}"] h2 button`);
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
                    openDialog('help');
                    break;
                default:
                    return;
            }
            e.preventDefault();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [hidden, openId, articles, hasNextPage, fetchNextPage, openReader, toggleRead, toggleFavorite, setUnreadOnly, unreadPref, refreshMutation, openDialog]);

    const subtitle = favorites
        ? `${articles.length}${hasNextPage ? '+' : ''} favori${articles.length > 1 ? 's' : ''}`
        : currentFeed?.fetch_error
          ? 'Ce flux ne se met plus à jour'
          : unreadTotal === 0
            ? 'Tout est lu'
            : `${unreadTotal} non lu${unreadTotal > 1 ? 's' : ''}`;

    const position = openIndex >= 0 ? `${openIndex + 1} sur ${articles.length}${hasNextPage ? '+' : ''}` : undefined;

    const header = (
        <header className="sticky top-0 z-20 bg-carbon md:bg-carbon-light border-b border-line pt-safe">
            <div className={`flex items-start gap-0.5 pl-5 pr-2 md:pr-3 pt-3 md:pt-4 ${!paneMode ? 'md:px-8' : ''}`}>
                <button onClick={() => setDrawerOpen(true)} className="hidden md:inline-flex xl:hidden tool-btn -ml-3 mr-1" aria-label="Mes flux" title="Mes flux">
                    <Icon name="menu" size={20} />
                </button>
                <div className="flex-1 min-w-0 pt-0.5">
                    <h1 className="text-[34px] md:text-[28px] font-semibold leading-[1.08] tracking-[-0.02em] truncate">{label}</h1>
                    <p className={`mt-1 text-[13px] ${currentFeed?.fetch_error ? 'text-danger' : 'text-paper-muted'}`} aria-live="polite">
                        {subtitle}
                    </p>
                </div>
                <button onClick={() => setSearchOpen(true)} className="tool-btn !text-paper-white xl:hidden" aria-label="Rechercher" title="Rechercher (/)">
                    <Icon name="search" size={22} />
                </button>
                <button onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending} className="hidden md:inline-flex tool-btn" aria-label="Actualiser les flux" title="Actualiser (r)">
                    <Icon name="refresh" size={19} className={refreshMutation.isPending ? 'animate-spin' : ''} />
                </button>
                {!favorites && unreadTotal > 0 && (
                    <button onClick={markAll} className="hidden md:inline-flex tool-btn" aria-label="Tout marquer comme lu" title="Tout marquer comme lu">
                        <Icon name="checkAll" size={19} />
                    </button>
                )}
                <MoreMenu favorites={favorites} unreadTotal={unreadTotal} onRefresh={() => refreshMutation.mutate()} onMarkAll={markAll} view={view} setView={setView} />
            </div>
            <div className={`flex items-center justify-between gap-2 px-5 md:pr-3 pt-2.5 pb-3 ${!paneMode ? 'md:px-8' : ''}`}>
                {!favorites ? (
                    <div className="segmented" role="group" aria-label="Articles affichés">
                        <button aria-pressed={unreadPref} onClick={() => setUnreadOnly(true)}>Non lus</button>
                        <button aria-pressed={!unreadPref} onClick={() => setUnreadOnly(false)}>Tous</button>
                    </div>
                ) : (
                    <span />
                )}
                <div className="hidden md:inline-flex gap-0.5" role="group" aria-label="Disposition">
                    <button
                        onClick={() => setView('list')}
                        aria-pressed={view === 'list'}
                        className={`tool-btn !w-9 !h-9 !rounded-lg ${view === 'list' ? '!bg-carbon-dark !text-paper-white' : ''}`}
                        aria-label="Vue liste"
                        title="Vue liste"
                    >
                        <Icon name="list" size={18} />
                    </button>
                    <button
                        onClick={() => setView('magazine')}
                        aria-pressed={view === 'magazine'}
                        className={`tool-btn !w-9 !h-9 !rounded-lg ${view === 'magazine' ? '!bg-carbon-dark !text-paper-white' : ''}`}
                        aria-label="Vue magazine"
                        title="Vue magazine"
                    >
                        <Icon name="grid" size={18} />
                    </button>
                </div>
            </div>
        </header>
    );

    const reader = openArticle && !hidden && (
        <Reader
            key={openArticle.id}
            article={openArticle}
            variant={paneMode ? 'pane' : 'overlay'}
            backLabel={label}
            position={position}
            next={openIndex >= 0 ? articles[openIndex + 1] : undefined}
            hasPrev={openIndex > 0}
            onClose={closeReader}
            onNext={openIndex >= 0 && (openIndex + 1 < articles.length || hasNextPage) ? goNext : undefined}
            onPrev={goPrev}
        />
    );

    return (
        <div className={`flex-1 min-w-0 min-h-0 flex ${hidden ? 'hidden' : ''}`}>
            <section
                ref={listRef}
                aria-label="Articles"
                aria-busy={isFetching}
                className={`relative min-h-0 overflow-y-auto overscroll-contain bg-carbon md:bg-carbon-light ${
                    paneMode ? 'w-[min(400px,42vw)] shrink-0 border-r border-line' : 'flex-1 min-w-0'
                }`}
            >
                {header}

                {/* New articles are announced, never inserted under the reader's eyes */}
                {newCount > 0 && (
                    <div className="sticky top-[132px] md:top-[124px] z-10 flex justify-center pt-3 pointer-events-none">
                        <button onClick={showNew} className="btn-primary !min-h-9 !px-4 pointer-events-auto shadow-[var(--shadow-lift)]">
                            <Icon name="arrowUp" size={14} strokeWidth={2.2} />
                            {newCount} nouvel{newCount > 1 ? 's' : ''} article{newCount > 1 ? 's' : ''}
                        </button>
                    </div>
                )}

                <div className={view === 'magazine' ? 'max-w-[2400px] mx-auto px-4 sm:px-6 md:px-8 py-6' : 'bg-carbon-light'}>
                    {isPending ? (
                        <div role="status" aria-label="Chargement des articles">
                            {Array.from({ length: 6 }, (_, i) => (
                                <div key={i} className="flex gap-3 pl-8 pr-4 py-4 border-b border-line">
                                    <div className="flex-1 space-y-2.5">
                                        <div className="h-3 w-1/3 rounded bg-carbon-dark animate-pulse" />
                                        <div className="h-4 w-11/12 rounded bg-carbon-dark animate-pulse" />
                                        <div className="h-4 w-2/3 rounded bg-carbon-dark animate-pulse" />
                                    </div>
                                    <div className="w-16 h-16 rounded-xl bg-carbon-dark animate-pulse" />
                                </div>
                            ))}
                        </div>
                    ) : isError && articles.length === 0 ? (
                        <div role="alert" className="flex flex-col items-center justify-center py-24 text-center px-6 gap-4">
                            <p className="text-paper-white font-serif text-xl">
                                {navigator.onLine ? 'Impossible de charger vos articles.' : 'Vous êtes hors ligne.'}
                            </p>
                            <button onClick={() => refetch()} className="btn-secondary">Réessayer</button>
                        </div>
                    ) : articles.length > 0 ? (
                        <>
                            {view === 'magazine' ? (
                                <div className={`article-grid transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}>
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
                            ) : (
                                <div className={`transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}>
                                    {articles.map((article, i) => (
                                        <ArticleRow
                                            key={article.id}
                                            index={i}
                                            article={article}
                                            selected={paneMode && article.id === openId}
                                            onOpen={openReader}
                                            onToggleRead={toggleRead}
                                            onToggleFavorite={toggleFavorite}
                                        />
                                    ))}
                                </div>
                            )}

                            <div ref={loadMoreRef} className="py-8 flex flex-col items-center gap-3">
                                {isFetchingNextPage ? (
                                    <div className="w-7 h-7 border-2 border-nature/20 border-t-nature rounded-full animate-spin" role="status" aria-label="Chargement" />
                                ) : !hasNextPage ? (
                                    <p className="text-[13px] text-paper-muted">Fin de la liste</p>
                                ) : null}
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-center px-8 gap-3">
                            <span aria-hidden="true" className="w-16 h-16 rounded-full bg-nature-soft text-nature flex items-center justify-center">
                                <Icon name={favorites ? 'star' : 'check'} size={28} strokeWidth={2} />
                            </span>
                            <p className="text-paper-white font-serif text-2xl font-semibold">
                                {favorites ? 'Aucun favori' : unreadOnly && (feeds?.length ?? 0) > 0 ? 'Tout est lu' : 'Aucun article'}
                            </p>
                            <p className="text-paper-muted text-sm max-w-xs">
                                {favorites
                                    ? 'Touchez l’étoile d’un article pour le retrouver ici.'
                                    : unreadOnly && (feeds?.length ?? 0) > 0
                                      ? 'Les nouveaux articles apparaîtront ici.'
                                      : 'Ajoutez un flux pour commencer.'}
                            </p>
                            {unreadOnly && (feeds?.length ?? 0) > 0 ? (
                                <button onClick={() => setUnreadOnly(false)} className="btn-secondary mt-2">Voir tous les articles</button>
                            ) : !favorites && (feeds?.length ?? 0) === 0 ? (
                                <button onClick={() => openDialog('add')} className="btn-primary mt-2">Ajouter un flux</button>
                            ) : null}
                        </div>
                    )}
                </div>

                {/* Back to top */}
                <div className="sticky bottom-5 z-20 flex justify-end pr-5 pointer-events-none">
                    <button
                        onClick={scrollTop}
                        className={`pointer-events-auto icon-btn !w-12 !h-12 bg-carbon-light shadow-[var(--shadow-lift)] transition-all duration-300 ${
                            showScrollTop ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0 !pointer-events-none'
                        }`}
                        aria-label="Retour en haut"
                        tabIndex={showScrollTop ? 0 : -1}
                    >
                        <Icon name="arrowUp" size={20} strokeWidth={2.2} />
                    </button>
                </div>
            </section>

            {paneMode && (
                <div className="flex-1 min-w-0 min-h-0 bg-carbon-light">
                    {reader || (
                        <div className="h-full flex flex-col items-center justify-center gap-3 px-8 text-center">
                            <span aria-hidden="true" className="w-16 h-16 rounded-full bg-carbon-dark text-paper-muted flex items-center justify-center">
                                <Icon name="book" size={28} />
                            </span>
                            <p className="font-serif text-xl font-semibold text-paper-white">Choisissez un article</p>
                            <p className="text-sm text-paper-muted">
                                <kbd className="kbd">j</kbd> <kbd className="kbd">k</kbd> pour parcourir la liste, <kbd className="kbd">o</kbd> pour ouvrir.
                            </p>
                        </div>
                    )}
                </div>
            )}
            {!paneMode && reader}
        </div>
    );
}

/** "⋯" menu of the list header on phones. */
function MoreMenu({
    favorites,
    unreadTotal,
    onRefresh,
    onMarkAll,
    view,
    setView,
}: {
    favorites: boolean;
    unreadTotal: number;
    onRefresh: () => void;
    onMarkAll: () => void;
    view: 'list' | 'magazine';
    setView: (v: 'list' | 'magazine') => void;
}) {
    const [open, setOpen] = useState(false);
    const btn = useRef<HTMLButtonElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    const close = () => {
        setOpen(false);
        btn.current?.focus();
    };
    useDismiss(open, close, [btn, panel]);
    const item = 'w-full text-left flex items-center gap-3 px-3 min-h-12 rounded-lg text-[15px] text-paper-white active:bg-carbon-dark focus-visible:bg-carbon-dark outline-none';
    const run = (fn: () => void) => () => {
        setOpen(false);
        fn();
    };

    return (
        <div className="relative md:hidden">
            <button ref={btn} onClick={() => setOpen((o) => !o)} className="tool-btn !text-paper-white" aria-haspopup="menu" aria-expanded={open} aria-label="Plus d’actions">
                <Icon name="more" size={22} />
            </button>
            {open && (
                <div ref={panel} role="menu" aria-label="Actions" onKeyDown={onMenuKeyDown} className="absolute right-0 top-full mt-1 z-50 w-64 surface-card p-1.5 animate-fade-in">
                    <button role="menuitem" autoFocus className={item} onClick={run(onRefresh)}>
                        <Icon name="refresh" size={19} className="text-paper-muted" />
                        Actualiser les flux
                    </button>
                    {!favorites && unreadTotal > 0 && (
                        <button role="menuitem" className={item} onClick={run(onMarkAll)}>
                            <Icon name="checkAll" size={19} className="text-paper-muted" />
                            Tout marquer comme lu
                        </button>
                    )}
                    <button role="menuitem" className={item} onClick={run(() => setView(view === 'list' ? 'magazine' : 'list'))}>
                        <Icon name={view === 'list' ? 'grid' : 'list'} size={19} className="text-paper-muted" />
                        {view === 'list' ? 'Vue magazine' : 'Vue liste'}
                    </button>
                </div>
            )}
        </div>
    );
}
