import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSwipeable } from 'react-swipeable';
import { articlesApi, type Article } from '../../api/articles';
import { patchArticle, useArticleActions } from '../../hooks/useArticleActions';
import { usePrefs } from '../../stores/prefsStore';
import { formatLong, readingTimeLabel } from '../../lib/format';
import { prepareArticleHtml } from '../../lib/html';
import { ShareButton } from '../ShareButton';
import { ReaderSettings } from './ReaderSettings';

interface ReaderProps {
    /** The list item being read (title, image… shown instantly while the body loads). */
    article: Article;
    next?: Article;
    hasPrev?: boolean;
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

const Chevron = ({ dir }: { dir: 'left' | 'right' }) => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={dir === 'left' ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'} />
    </svg>
);

/**
 * Article opened as a large card above the (dimmed) grid.
 * Close: ✕, Escape or a click beside the card. Previous / next: side arrows
 * on desktop, bottom bar on mobile, j/k or ←/→ on the keyboard.
 */
export function Reader({ article: listArticle, next, hasPrev, onClose, onNext, onPrev }: ReaderProps) {
    const qc = useQueryClient();
    const { toggleRead, toggleFavorite } = useArticleActions();
    const fontSize = usePrefs((s) => s.fontSize);
    const lineHeight = usePrefs((s) => s.lineHeight);
    const width = usePrefs((s) => s.width);
    const font = usePrefs((s) => s.font);
    const setFontSize = usePrefs((s) => s.setFontSize);

    const overlayRef = useRef<HTMLDivElement>(null);
    const progressRef = useRef<HTMLDivElement>(null);
    const titleRef = useRef<HTMLHeadingElement>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [summarizing, setSummarizing] = useState(false);
    const [summaryError, setSummaryError] = useState('');

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

    // Modal behaviour: the app behind is inert and doesn't scroll; focus
    // moves to the title and returns to the card that opened the article.
    useLayoutEffect(() => {
        const root = document.getElementById('root');
        const previous = document.activeElement as HTMLElement | null;
        root?.setAttribute('inert', '');
        document.body.style.overflow = 'hidden';
        overlayRef.current?.scrollTo({ top: 0 });
        titleRef.current?.focus({ preventScroll: true });
        return () => {
            root?.removeAttribute('inert');
            document.body.style.overflow = '';
            previous?.focus?.({ preventScroll: true });
        };
    }, []);

    // Reading progress without React re-renders.
    useEffect(() => {
        const el = overlayRef.current;
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
            const el = overlayRef.current;
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

    // Optional touch shortcut on phones; the buttons below do the same.
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

    const summarize = async () => {
        setSummarizing(true);
        setSummaryError('');
        try {
            const res = await articlesApi.summarize(listArticle.id);
            patchArticle(qc, listArticle.id, { ai_summary: res.summary });
        } catch {
            setSummaryError('Le résumé n’a pas pu être généré. Réessayez plus tard.');
        } finally {
            setSummarizing(false);
        }
    };

    const style = {
        '--reader-size': `${fontSize}px`,
        '--reader-leading': String(lineHeight),
        '--reader-font': FONTS[font],
        letterSpacing: font === 'legible' ? '0.02em' : undefined,
    } as React.CSSProperties;

    const date = listArticle.published_at || listArticle.created_at;

    const body = (
        <div
            ref={overlayRef}
            className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-nature-dark/45 backdrop-blur-sm animate-fade-in"
            onMouseDown={(e) => {
                // Click beside the card closes it.
                if (e.target === e.currentTarget) onClose();
            }}
        >
            {/* Side arrows (desktop) */}
            {hasPrev && onPrev && (
                <button
                    onClick={onPrev}
                    className="hidden lg:flex fixed left-6 top-1/2 -translate-y-1/2 z-10 w-12 h-12 items-center justify-center rounded-full bg-carbon-light text-paper-white shadow-lg hover:text-nature transition-colors"
                    aria-label="Article précédent"
                    title="Article précédent (k)"
                >
                    <Chevron dir="left" />
                </button>
            )}
            {onNext && (
                <button
                    onClick={onNext}
                    className="hidden lg:flex fixed right-6 top-1/2 -translate-y-1/2 z-10 w-12 h-12 items-center justify-center rounded-full bg-carbon-light text-paper-white shadow-lg hover:text-nature transition-colors"
                    aria-label="Article suivant"
                    title="Article suivant (j)"
                >
                    <Chevron dir="right" />
                </button>
            )}

            <article
                {...swipe}
                role="dialog"
                aria-modal="true"
                aria-labelledby="reader-title"
                className="relative mx-auto w-full max-w-3xl min-h-full md:min-h-0 md:my-10 bg-carbon-light md:rounded-3xl overflow-clip animate-rise"
                style={{ ...style, boxShadow: 'var(--shadow-float)' }}
            >
                {/* Card header: source on the left, actions and close on the right */}
                <div className="sticky top-0 z-20 bg-carbon-light/95 backdrop-blur border-b border-paper-muted/10">
                    <div className="flex items-center gap-1 pl-5 pr-2 sm:pl-7 sm:pr-3 h-16">
                        <div className="flex-1 min-w-0 text-sm">
                            <p className="font-semibold text-nature truncate">{listArticle.feed_title || 'Article'}</p>
                            <p className="text-paper-muted truncate">
                                <time dateTime={date}>{formatLong(date)}</time> · {readingTimeLabel(listArticle.reading_time)}<span className="hidden sm:inline"> de lecture</span>
                            </p>
                        </div>
                        <button
                            onClick={() => toggleFavorite(listArticle)}
                            className={`w-11 h-11 inline-flex items-center justify-center rounded-full transition-colors ${
                                article.is_favorite ? 'text-earth' : 'text-paper-muted hover:text-earth'
                            }`}
                            aria-pressed={article.is_favorite}
                            aria-label="Favori"
                            title={article.is_favorite ? 'Retirer des favoris (s)' : 'Ajouter aux favoris (s)'}
                        >
                            <svg className="w-5 h-5" fill={article.is_favorite ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                            </svg>
                        </button>
                        <ShareButton article={article} className="w-11 h-11 inline-flex items-center justify-center rounded-full text-paper-muted hover:text-nature transition-colors" />
                        <div className="relative">
                            <button
                                onClick={() => setSettingsOpen((o) => !o)}
                                className="w-11 h-11 inline-flex items-center justify-center rounded-full text-paper-muted hover:text-nature font-serif text-base transition-colors"
                                aria-expanded={settingsOpen}
                                aria-label="Affichage du texte"
                                title="Affichage du texte"
                            >
                                Aa
                            </button>
                            {settingsOpen && <ReaderSettings onClose={() => setSettingsOpen(false)} />}
                        </div>
                        <button
                            onClick={onClose}
                            className="ml-1 w-11 h-11 inline-flex items-center justify-center rounded-full bg-carbon-dark text-paper-white hover:bg-nature hover:text-on-nature transition-colors"
                            aria-label="Fermer"
                            title="Fermer (Échap)"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <div className="h-0.5 bg-transparent">
                        <div ref={progressRef} className="h-full bg-nature origin-left" style={{ transform: 'scaleX(0)' }} aria-hidden="true" />
                    </div>
                </div>

                {listArticle.image_url && (
                    <img
                        src={listArticle.image_url}
                        alt=""
                        fetchPriority="high"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="w-full max-h-[42vh] object-cover bg-carbon-dark"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                )}

                <div className="px-5 sm:px-10 pb-10 mx-auto" style={{ maxWidth: `calc(${MEASURES[width]} + 5rem)` }}>
                    <header className="pt-8 pb-6">
                        <h1
                            id="reader-title"
                            ref={titleRef}
                            tabIndex={-1}
                            className="font-serif text-paper-white leading-[1.15] tracking-tight text-balance outline-none"
                            style={{ fontSize: 'clamp(1.75rem, 1.3rem + 1.8vw, 2.6rem)' }}
                        >
                            {listArticle.title}
                        </h1>
                        {listArticle.author && <p className="mt-3 text-paper-muted text-sm">Par {listArticle.author}</p>}

                        {article.ai_summary ? (
                            <aside className="mt-6 bg-nature/8 border-l-4 border-nature p-5 rounded-r-xl" aria-label="Résumé">
                                <p className="text-paper-white/90 leading-relaxed font-reading">{article.ai_summary}</p>
                            </aside>
                        ) : (
                            <div className="mt-5">
                                <button
                                    onClick={summarize}
                                    disabled={summarizing}
                                    className="inline-flex items-center gap-2 text-sm font-medium text-nature hover:underline disabled:opacity-60"
                                >
                                    {summarizing && (
                                        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                                    )}
                                    {summarizing ? 'Résumé en cours…' : 'Résumer cet article'}
                                </button>
                                {summaryError && <p role="alert" className="mt-2 text-sm text-danger">{summaryError}</p>}
                            </div>
                        )}
                    </header>

                    {detail ? (
                        html ? (
                            <div className="magazine-content" dangerouslySetInnerHTML={{ __html: html }} />
                        ) : (
                            <p className="text-paper-muted italic">Ce flux ne publie que le titre de l’article.</p>
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

                    {listArticle.url && (
                        <a
                            href={listArticle.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-10 inline-flex items-center gap-2 text-sm font-semibold text-nature hover:underline"
                        >
                            Lire sur le site d’origine
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                        </a>
                    )}
                </div>

                {/* Bottom navigation: always visible on mobile, "up next" on every size */}
                <nav className="sticky bottom-0 z-20 border-t border-paper-muted/10 bg-carbon-light/95 backdrop-blur" aria-label="Navigation entre articles">
                    <div className="flex items-stretch">
                        <button
                            onClick={onPrev}
                            disabled={!hasPrev || !onPrev}
                            className="flex items-center gap-2 px-4 sm:px-6 min-h-14 text-sm font-medium text-paper-muted hover:text-nature disabled:opacity-35 disabled:pointer-events-none"
                        >
                            <Chevron dir="left" />
                            <span className="hidden sm:inline">Précédent</span>
                        </button>
                        <button
                            onClick={onNext}
                            disabled={!onNext}
                            className="flex-1 min-w-0 flex items-center justify-end gap-3 px-4 sm:px-6 min-h-14 text-right hover:text-nature disabled:opacity-35 disabled:pointer-events-none group"
                        >
                            <span className="min-w-0">
                                <span className="block text-xs text-paper-muted">Article suivant</span>
                                <span className="block text-sm font-semibold text-paper-white group-hover:text-nature truncate">
                                    {next ? next.title : onNext ? 'Charger la suite' : 'Fin de la liste'}
                                </span>
                            </span>
                            <Chevron dir="right" />
                        </button>
                    </div>
                </nav>
            </article>
        </div>
    );

    return createPortal(body, document.body);
}
