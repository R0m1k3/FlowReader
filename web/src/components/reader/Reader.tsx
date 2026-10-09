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

/**
 * Full-screen, distraction-free reader used on desktop and mobile.
 * Rendered in a portal; the app behind it is made inert while it's open.
 */
export function Reader({ article: listArticle, next, hasPrev, onClose, onNext, onPrev }: ReaderProps) {
    const qc = useQueryClient();
    const { toggleRead, toggleFavorite } = useArticleActions();
    const fontSize = usePrefs((s) => s.fontSize);
    const lineHeight = usePrefs((s) => s.lineHeight);
    const width = usePrefs((s) => s.width);
    const font = usePrefs((s) => s.font);
    const setFontSize = usePrefs((s) => s.setFontSize);

    const scrollRef = useRef<HTMLDivElement>(null);
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
        }, 600);
        return () => window.clearTimeout(t);
    }, [next, qc]);

    // Modal behaviour: make the app inert, move focus in, restore it on close.
    useLayoutEffect(() => {
        const root = document.getElementById('root');
        const previous = document.activeElement as HTMLElement | null;
        root?.setAttribute('inert', '');
        document.body.style.overflow = 'hidden';
        return () => {
            root?.removeAttribute('inert');
            document.body.style.overflow = '';
            previous?.focus?.({ preventScroll: true });
        };
    }, []);

    // New article: back to top, focus the title.
    useLayoutEffect(() => {
        scrollRef.current?.scrollTo({ top: 0 });
        titleRef.current?.focus({ preventScroll: true });
        setSummaryError('');
    }, [listArticle.id]);

    // Reading progress without React re-renders.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        let frame = 0;
        const update = () => {
            frame = 0;
            const max = el.scrollHeight - el.clientHeight;
            const ratio = max > 0 ? Math.min(1, el.scrollTop / max) : 1;
            if (progressRef.current) {
                progressRef.current.style.transform = `scaleX(${ratio})`;
                progressRef.current.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
            }
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

    // Keyboard shortcuts (Miniflux / NetNewsWire conventions).
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
            const el = scrollRef.current;
            switch (e.key) {
                case 'Escape':
                    onClose();
                    break;
                case 'j':
                case 'n':
                case 'ArrowRight':
                    if (onNext) onNext();
                    break;
                case 'k':
                case 'p':
                case 'ArrowLeft':
                    if (onPrev && hasPrev) onPrev();
                    break;
                case 's':
                case 'f':
                    toggleFavorite(listArticle);
                    break;
                case 'm':
                    toggleRead(listArticle);
                    break;
                case 'v':
                case 'o':
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
                    // Space pages down; at the end it moves to the next article.
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

    // Touch swipe between articles; ignored over horizontally scrollable content.
    const swipe = useSwipeable({
        onSwipedLeft: (ev) => {
            if (!(ev.event.target as Element).closest('pre,table,[data-noswipe]') && onNext) onNext();
        },
        onSwipedRight: (ev) => {
            if (!(ev.event.target as Element).closest('pre,table,[data-noswipe]') && hasPrev && onPrev) onPrev();
        },
        trackMouse: false,
        delta: 80,
        swipeDuration: 500,
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
    const measure = MEASURES[width];

    const body = (
        <div
            ref={scrollRef}
            className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-carbon animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reader-title"
        >
            {/* Progress */}
            <div className="sticky top-0 z-30 h-0.5 w-full bg-transparent">
                <div
                    ref={progressRef}
                    className="h-full bg-nature origin-left will-change-transform"
                    style={{ transform: 'scaleX(0)' }}
                    role="progressbar"
                    aria-label="Progression de lecture"
                    aria-valuemin={0}
                    aria-valuemax={100}
                />
            </div>

            {/* Toolbar */}
            <div className="sticky top-0.5 z-20 bg-carbon/90 backdrop-blur-md border-b border-paper-muted/10">
                <div className="mx-auto max-w-5xl flex items-center gap-1.5 px-3 sm:px-6 py-2">
                    <button onClick={onClose} className="icon-btn" aria-label="Fermer (Échap)" title="Fermer (Échap)">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div className="hidden sm:flex items-center gap-1.5">
                        <button onClick={onPrev} disabled={!hasPrev} className="icon-btn" aria-label="Article précédent (k)" title="Précédent (k)">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                        </button>
                        <button onClick={onNext} disabled={!onNext} className="icon-btn" aria-label="Article suivant (j)" title="Suivant (j)">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                    </div>

                    <span className="flex-1" />

                    <button
                        onClick={() => toggleRead(listArticle)}
                        className="icon-btn"
                        aria-pressed={!article.is_read}
                        aria-label={article.is_read ? 'Marquer comme non lu (m)' : 'Marquer comme lu (m)'}
                        title={article.is_read ? 'Marquer non lu (m)' : 'Marquer lu (m)'}
                    >
                        <svg className="w-4 h-4" fill={article.is_read ? 'none' : 'currentColor'} viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <circle cx="12" cy="12" r="5" strokeWidth={1.8} />
                        </svg>
                    </button>
                    <button
                        onClick={() => toggleFavorite(listArticle)}
                        className={`icon-btn ${article.is_favorite ? '!bg-earth !text-on-earth !border-earth' : ''}`}
                        aria-pressed={article.is_favorite}
                        aria-label="Favori (s)"
                        title={article.is_favorite ? 'Retirer des favoris (s)' : 'Ajouter aux favoris (s)'}
                    >
                        <svg className="w-4 h-4" fill={article.is_favorite ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                    </button>
                    <ShareButton article={article} />
                    <div className="relative">
                        <button
                            onClick={() => setSettingsOpen((o) => !o)}
                            className="icon-btn font-serif text-base"
                            aria-expanded={settingsOpen}
                            aria-label="Réglages de lecture"
                            title="Réglages de lecture"
                        >
                            Aa
                        </button>
                        {settingsOpen && <ReaderSettings onClose={() => setSettingsOpen(false)} />}
                    </div>
                    {listArticle.url && (
                        <a href={listArticle.url} target="_blank" rel="noopener noreferrer" className="icon-btn" aria-label="Ouvrir l'article original (v)" title="Original (v)">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                        </a>
                    )}
                </div>
            </div>

            <article {...swipe} className="mx-auto max-w-5xl pb-28" style={style}>
                {listArticle.image_url && (
                    <div className="px-0 sm:px-6 pt-0 sm:pt-6">
                        <img
                            src={listArticle.image_url}
                            alt=""
                            fetchPriority="high"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            className="w-full max-h-[46vh] object-cover sm:rounded-3xl bg-carbon-dark"
                            onError={(e) => (e.currentTarget.style.display = 'none')}
                        />
                    </div>
                )}

                <div className="px-5 sm:px-6 mx-auto" style={{ maxWidth: measure }}>
                    <header className="pt-8 pb-6">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-5 text-sm text-paper-muted">
                            <span className="chip">{listArticle.feed_title || 'Journal'}</span>
                            <time dateTime={listArticle.published_at || listArticle.created_at}>
                                {formatLong(listArticle.published_at || listArticle.created_at)}
                            </time>
                            <span aria-hidden="true">·</span>
                            <span>{readingTimeLabel(listArticle.reading_time)} de lecture</span>
                        </div>

                        <h1
                            id="reader-title"
                            ref={titleRef}
                            tabIndex={-1}
                            className="font-serif text-paper-white leading-[1.15] tracking-tight text-balance outline-none"
                            style={{ fontSize: 'clamp(1.9rem, 1.3rem + 2.4vw, 3rem)' }}
                        >
                            {listArticle.title}
                        </h1>
                        {listArticle.author && <p className="mt-4 text-paper-muted text-sm">Par {listArticle.author}</p>}

                        {/* AI digest */}
                        <div className="mt-7">
                            {article.ai_summary ? (
                                <aside className="bg-nature/8 border-l-4 border-nature p-5 rounded-r-2xl" aria-label="Résumé IA">
                                    <h2 className="eyebrow mb-2">Résumé IA</h2>
                                    <p className="text-paper-white/90 leading-relaxed font-reading">{article.ai_summary}</p>
                                </aside>
                            ) : (
                                <>
                                    <button onClick={summarize} disabled={summarizing} className="btn-secondary">
                                        {summarizing ? (
                                            <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                                        ) : (
                                            <span aria-hidden="true">✨</span>
                                        )}
                                        {summarizing ? 'Génération…' : 'Résumer avec l’IA'}
                                    </button>
                                    {summaryError && <p role="alert" className="mt-2 text-sm text-danger">{summaryError}</p>}
                                </>
                            )}
                        </div>
                    </header>

                    {detail ? (
                        html ? (
                            <div className={`magazine-content ${font === 'serif' ? 'drop-cap' : ''}`} dangerouslySetInnerHTML={{ __html: html }} />
                        ) : (
                            <p className="text-paper-muted italic">
                                Ce flux ne publie qu’un titre. {listArticle.url && 'Ouvrez l’article original pour le lire en entier.'}
                            </p>
                        )
                    ) : isError ? (
                        <div role="alert" className="text-paper-muted">
                            Impossible de charger l’article.{' '}
                            <button className="text-nature underline" onClick={() => refetch()}>Réessayer</button>
                        </div>
                    ) : (
                        <div className="space-y-4" aria-busy="true" aria-label="Chargement de l'article">
                            {[92, 100, 85, 97, 60].map((w, i) => (
                                <div key={i} className="h-4 rounded bg-carbon-dark animate-pulse" style={{ width: `${w}%` }} />
                            ))}
                        </div>
                    )}

                    {listArticle.url && (
                        <p className="mt-12">
                            <a href={listArticle.url} target="_blank" rel="noopener noreferrer" className="btn-secondary">
                                Lire sur le site d’origine
                            </a>
                        </p>
                    )}

                    {/* Up next */}
                    {next && onNext && (
                        <button
                            onClick={onNext}
                            className="mt-14 w-full text-left surface-card p-5 flex items-center gap-4 hover:border-nature/40 transition-colors group"
                        >
                            <span className="flex-1 min-w-0">
                                <span className="eyebrow block mb-1">À suivre</span>
                                <span className="block font-serif text-lg text-paper-white leading-snug line-clamp-2 group-hover:text-nature">
                                    {next.title}
                                </span>
                                <span className="block mt-1 text-xs text-paper-muted">
                                    {next.feed_title} · {readingTimeLabel(next.reading_time)}
                                </span>
                            </span>
                            <span className="kbd hidden sm:inline-flex" aria-hidden="true">Espace</span>
                        </button>
                    )}
                </div>
            </article>
        </div>
    );

    return createPortal(body, document.body);
}
