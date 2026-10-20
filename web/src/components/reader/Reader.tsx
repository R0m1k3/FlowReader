import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSwipeable } from 'react-swipeable';
import { articlesApi, type Article } from '../../api/articles';
import { useArticleActions } from '../../hooks/useArticleActions';
import { usePrefs } from '../../stores/prefsStore';
import { formatLong, readingTimeLabel } from '../../lib/format';
import { prepareArticleHtml } from '../../lib/html';
import { ShareButton } from '../ShareButton';
import { FeedAvatar } from '../FeedAvatar';
import { Icon } from '../Icon';
import { ReaderSettings } from './ReaderSettings';
import { AiSummary } from './AiSummary';

interface ReaderProps {
    /** The list item being read (title, image… shown instantly while the body loads). */
    article: Article;
    next?: Article;
    hasPrev?: boolean;
    /**
     * 'pane': the right-hand column of the desktop layout.
     * 'overlay': full screen on phones, a card above the dimmed page on larger screens.
     */
    variant?: 'pane' | 'overlay';
    /** Where the mobile back button returns to. */
    backLabel?: string;
    /** "3 sur 128" shown in the toolbar. */
    position?: string;
    onClose: () => void;
    onNext?: () => void;
    onPrev?: () => void;
}

const MEASURES = { narrow: '58ch', medium: '66ch', wide: '76ch' } as const;
const FONTS = {
    serif: 'var(--font-reading)',
    sans: 'var(--font-sans)',
    legible: 'var(--font-legible)',
} as const;

function isTypingTarget(t: EventTarget | null) {
    const el = t as HTMLElement | null;
    return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

/**
 * The article reader. Close: ✕, Escape, back (or a click beside the card in
 * overlay mode). Previous / next: toolbar arrows on desktop, "Suivant" in the
 * bottom bar on phones, j/k or ←/→ on the keyboard, a horizontal swipe on touch.
 */
export function Reader({
    article: listArticle,
    next,
    hasPrev,
    variant = 'overlay',
    backLabel = 'Retour',
    position,
    onClose,
    onNext,
    onPrev,
}: ReaderProps) {
    const qc = useQueryClient();
    const { toggleRead, toggleFavorite } = useArticleActions();
    const fontSize = usePrefs((s) => s.fontSize);
    const lineHeight = usePrefs((s) => s.lineHeight);
    const width = usePrefs((s) => s.width);
    const font = usePrefs((s) => s.font);
    const setFontSize = usePrefs((s) => s.setFontSize);
    const overlay = variant === 'overlay';

    const scrollRef = useRef<HTMLDivElement>(null);
    const progressRef = useRef<HTMLDivElement>(null);
    const titleRef = useRef<HTMLHeadingElement>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [imgFailed, setImgFailed] = useState(false);

    const { data: detail, isError, refetch } = useQuery({
        queryKey: ['article', listArticle.id],
        queryFn: () => articlesApi.get(listArticle.id),
        staleTime: 5 * 60 * 1000,
    });

    // Live flags (read/favorite/summary) come from the list cache, content from the detail.
    const article = { ...detail, ...listArticle, ai_summary: listArticle.ai_summary || detail?.ai_summary };
    const html = useMemo(
        () => prepareArticleHtml(detail?.content || detail?.summary || '', listArticle.image_url),
        [detail?.content, detail?.summary, listArticle.image_url],
    );

    // Prefetch the next article so "next" is instant.
    useEffect(() => {
        if (!next) return;
        const t = window.setTimeout(() => {
            qc.prefetchQuery({ queryKey: ['article', next.id], queryFn: () => articlesApi.get(next.id), staleTime: 5 * 60 * 1000 });
            if (next.image_url) new Image().src = next.image_url;
        }, 500);
        return () => window.clearTimeout(t);
    }, [next, qc]);

    // Focus moves to the title. In overlay mode the app behind is inert and
    // doesn't scroll, and focus returns to the row that opened the article.
    useLayoutEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        const root = overlay ? document.getElementById('root') : null;
        root?.setAttribute('inert', '');
        if (overlay) document.body.style.overflow = 'hidden';
        scrollRef.current?.scrollTo({ top: 0 });
        titleRef.current?.focus({ preventScroll: true });
        return () => {
            root?.removeAttribute('inert');
            if (overlay) document.body.style.overflow = '';
            if (overlay) previous?.focus?.({ preventScroll: true });
        };
    }, [overlay]);

    // Reading progress without React re-renders.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        let frame = 0;
        const update = () => {
            frame = 0;
            const max = el.scrollHeight - el.clientHeight;
            const ratio = max > 0 ? Math.min(1, el.scrollTop / max) : 1;
            if (progressRef.current) progressRef.current.style.transform = `scaleX(${ratio})`;
        };
        const onScroll = () => {
            if (!frame) frame = requestAnimationFrame(update);
        };
        update();
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            el.removeEventListener('scroll', onScroll);
            cancelAnimationFrame(frame);
        };
    }, [html]);

    const openOriginal = useCallback(() => {
        if (listArticle.url) window.open(listArticle.url, '_blank', 'noopener,noreferrer');
    }, [listArticle.url]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
            const el = scrollRef.current;
            switch (e.key) {
                case 'Escape':
                    onClose();
                    break;
                case 'j':
                case 'ArrowRight':
                    if (onNext) onNext();
                    break;
                case 'k':
                case 'ArrowLeft':
                    if (onPrev && hasPrev) onPrev();
                    break;
                case 's':
                    toggleFavorite(listArticle);
                    break;
                case 'm':
                    toggleRead(listArticle);
                    break;
                case 'v':
                    openOriginal();
                    break;
                case '+':
                case '=':
                    setFontSize(fontSize + 1);
                    break;
                case '-':
                    setFontSize(fontSize - 1);
                    break;
                case ' ': {
                    if (!el || e.shiftKey) return;
                    const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
                    if (atEnd && onNext) {
                        e.preventDefault();
                        onNext();
                    }
                    return;
                }
                default:
                    return;
            }
            e.preventDefault();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, onNext, onPrev, hasPrev, toggleFavorite, toggleRead, listArticle, openOriginal, fontSize, setFontSize]);

    // Optional touch shortcut on phones; the buttons do the same.
    const swipe = useSwipeable({
        onSwipedLeft: (ev) => {
            if (!(ev.event.target as Element).closest('pre,table') && onNext) onNext();
        },
        onSwipedRight: (ev) => {
            if (!(ev.event.target as Element).closest('pre,table') && hasPrev && onPrev) onPrev();
        },
        trackMouse: false,
        delta: 90,
        swipeDuration: 450,
        preventScrollOnSwipe: false,
    });

    const style = {
        '--reader-size': `${fontSize}px`,
        '--reader-leading': String(lineHeight),
        '--reader-font': FONTS[font],
        letterSpacing: font === 'legible' ? '0.02em' : undefined,
    } as React.CSSProperties;

    const date = listArticle.published_at || listArticle.created_at;
    const fav = !!article.is_favorite;
    const showImage = !!listArticle.image_url && !imgFailed;

    const favButton = (cls: string, size: number) => (
        <button
            onClick={() => toggleFavorite(listArticle)}
            className={`${cls} ${fav ? '!text-earth' : ''}`}
            aria-pressed={fav}
            aria-label="Favori"
            title={fav ? 'Retirer des favoris (s)' : 'Ajouter aux favoris (s)'}
        >
            <Icon name="star" size={size} filled={fav} />
        </button>
    );

    const body = (
        <div
            ref={scrollRef}
            className={
                overlay
                    ? 'fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-carbon-light md:bg-nature-dark/45 md:backdrop-blur-sm animate-fade-in'
                    : 'h-full overflow-y-auto overscroll-contain bg-carbon-light'
            }
            onMouseDown={(e) => {
                // Click beside the card closes it.
                if (overlay && e.target === e.currentTarget) onClose();
            }}
        >
            <article
                {...swipe}
                role={overlay ? 'dialog' : undefined}
                aria-modal={overlay ? true : undefined}
                aria-labelledby="reader-title"
                className={
                    overlay
                        ? 'relative mx-auto w-full max-w-3xl min-h-full md:min-h-0 md:my-10 bg-carbon-light md:rounded-3xl md:shadow-[var(--shadow-float)] overflow-clip animate-rise flex flex-col'
                        : 'min-h-full flex flex-col'
                }
                style={style}
            >
                {/* Toolbar */}
                <div className={`sticky top-0 z-20 bg-carbon-light/95 backdrop-blur border-b border-line ${overlay ? 'pt-safe md:pt-0' : ''}`}>
                    <div className="flex items-center gap-0.5 h-[52px] md:h-[60px] pl-1 pr-1.5 md:px-3">
                        <button
                            onClick={onClose}
                            className="md:hidden inline-flex items-center gap-0.5 min-h-11 pl-1 pr-2.5 rounded-full text-nature text-base font-semibold max-w-[45%]"
                        >
                            <Icon name="chevronLeft" size={24} strokeWidth={2} />
                            <span className="truncate">{backLabel}</span>
                        </button>
                        <div className="hidden md:flex items-center">
                            <button onClick={onPrev} disabled={!hasPrev || !onPrev} className="tool-btn !text-paper-white" aria-label="Article précédent" title="Article précédent (k)">
                                <Icon name="chevronUp" size={20} strokeWidth={2} />
                            </button>
                            <button onClick={onNext} disabled={!onNext} className="tool-btn !text-paper-white" aria-label="Article suivant" title="Article suivant (j)">
                                <Icon name="chevronDown" size={20} strokeWidth={2} />
                            </button>
                        </div>
                        <span className="flex-1 min-w-0 text-center md:text-left md:pl-2 text-xs text-paper-muted tabular-nums truncate">{position}</span>

                        <div className="relative">
                            <button
                                onClick={() => setSettingsOpen((o) => !o)}
                                className="tool-btn !text-paper-white font-serif !text-lg font-semibold"
                                aria-expanded={settingsOpen}
                                aria-label="Réglages de lecture"
                                title="Taille, police, thème"
                            >
                                Aa
                            </button>
                            {settingsOpen && <ReaderSettings onClose={() => setSettingsOpen(false)} />}
                        </div>
                        <div className="hidden md:flex items-center gap-0.5">
                            {favButton('tool-btn !text-paper-white', 19)}
                            <ShareButton article={article} className="tool-btn !text-paper-white" />
                            {listArticle.url && (
                                <a
                                    href={listArticle.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Ouvrir l’original (v)"
                                    className="ml-1.5 hidden lg:inline-flex items-center gap-2 min-h-10 px-3.5 rounded-full border border-line text-[13px] font-semibold text-paper-white hover:border-nature/50 transition-colors"
                                >
                                    Ouvrir l’original
                                    <Icon name="external" size={15} strokeWidth={1.9} />
                                </a>
                            )}
                            <button onClick={onClose} className="tool-btn ml-1" aria-label="Fermer l’article" title="Fermer (Échap)">
                                <Icon name="close" size={20} strokeWidth={2} />
                            </button>
                        </div>
                    </div>
                    <div className="h-0.5">
                        <div ref={progressRef} className="h-full bg-nature origin-left" style={{ transform: 'scaleX(0)' }} aria-hidden="true" />
                    </div>
                </div>

                <div className="w-full px-5 md:px-8 pt-6 md:pt-10 pb-10 mx-auto" style={{ maxWidth: `calc(${MEASURES[width]} + 4rem)` }}>
                    <header>
                        <p className="flex items-center gap-2 flex-wrap text-[13px] text-paper-muted">
                            <FeedAvatar id={listArticle.feed_id} title={listArticle.feed_title} />
                            <span className="font-semibold text-nature">{listArticle.feed_title || 'Article'}</span>
                            <span aria-hidden="true">·</span>
                            <time dateTime={date}>{formatLong(date)}</time>
                            <span aria-hidden="true">·</span>
                            <span>{readingTimeLabel(listArticle.reading_time)} de lecture</span>
                        </p>
                        <h1
                            id="reader-title"
                            ref={titleRef}
                            tabIndex={-1}
                            className="mt-3.5 font-semibold text-paper-white leading-[1.13] tracking-[-0.015em] text-balance outline-none"
                            style={{ fontSize: 'clamp(1.8rem, 1.4rem + 1.4vw, 2.5rem)' }}
                        >
                            {listArticle.title}
                        </h1>
                        {listArticle.author && <p className="mt-2.5 text-paper-muted text-sm">Par {listArticle.author}</p>}

                        <AiSummary articleId={listArticle.id} summary={article.ai_summary} />
                    </header>

                    {showImage && (
                        <img
                            src={listArticle.image_url}
                            alt=""
                            fetchPriority="high"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            className="mt-7 w-full max-h-[48vh] object-cover rounded-2xl bg-carbon-dark"
                            onError={() => setImgFailed(true)}
                        />
                    )}

                    <div className="mt-7">
                        {detail ? (
                            html ? (
                                <div className="magazine-content" dangerouslySetInnerHTML={{ __html: html }} />
                            ) : (
                                <p className="text-paper-muted">Ce flux ne publie que le titre de l’article.</p>
                            )
                        ) : isError ? (
                            <p role="alert" className="text-paper-muted">
                                Impossible de charger l’article.{' '}
                                <button className="text-nature underline" onClick={() => refetch()}>Réessayer</button>
                            </p>
                        ) : (
                            <div className="space-y-4" aria-busy="true" aria-label="Chargement de l'article">
                                {[92, 100, 85, 97, 60].map((w, i) => (
                                    <div key={i} className="h-4 rounded bg-carbon-dark animate-pulse" style={{ width: `${w}%` }} />
                                ))}
                            </div>
                        )}
                    </div>

                    {listArticle.url && (
                        <a
                            href={listArticle.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-10 inline-flex items-center gap-2 text-sm font-semibold text-nature hover:underline"
                        >
                            Lire sur le site d’origine
                            <Icon name="external" size={16} />
                        </a>
                    )}

                    {/* Up next (desktop / tablet) */}
                    <div className="hidden md:block mt-12 pt-5 border-t border-line">
                        <button
                            onClick={onNext}
                            disabled={!onNext}
                            className="w-full flex items-center gap-4 text-left px-[18px] py-4 rounded-2xl border border-line bg-carbon hover:border-nature/40 transition-colors disabled:opacity-60 disabled:pointer-events-none"
                        >
                            <span className="flex-1 min-w-0">
                                <span className="block text-xs font-semibold text-paper-muted">Article suivant · j</span>
                                <span className="block mt-1 font-serif text-lg font-semibold leading-snug text-paper-white truncate">
                                    {next ? next.title : onNext ? 'Charger la suite' : 'Vous êtes à jour — plus rien à lire ici.'}
                                </span>
                            </span>
                            <Icon name="arrowRight" size={20} strokeWidth={2} className="text-nature shrink-0" />
                        </button>
                    </div>
                </div>

                {/* Bottom action bar (phones) */}
                <nav
                    aria-label="Actions sur l’article"
                    className="md:hidden mt-auto sticky bottom-0 z-20 flex items-center gap-1 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-carbon-light/95 backdrop-blur border-t border-line"
                >
                    {favButton('tool-btn !w-12 !h-12 !text-paper-white', 24)}
                    <ShareButton article={article} className="tool-btn !w-12 !h-12 !text-paper-white" iconSize={23} menuAbove />
                    {listArticle.url && (
                        <button onClick={openOriginal} className="tool-btn !w-12 !h-12 !text-paper-white" aria-label="Ouvrir l’original">
                            <Icon name="external" size={22} />
                        </button>
                    )}
                    <span className="flex-1" />
                    <button
                        onClick={onNext ?? onClose}
                        className="inline-flex items-center gap-2 min-h-12 pl-5 pr-4 rounded-full bg-nature text-on-nature text-[15px] font-semibold active:scale-[0.97] transition-transform"
                    >
                        {onNext ? 'Suivant' : 'Terminé'}
                        <Icon name={onNext ? 'arrowRight' : 'check'} size={18} strokeWidth={2.2} />
                    </button>
                </nav>
            </article>
        </div>
    );

    return overlay ? createPortal(body, document.body) : body;
}
