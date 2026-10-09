import { memo, useState } from 'react';
import { useSwipeable } from 'react-swipeable';
import type { Article } from '../api/articles';
import { formatRelative, readingTimeLabel } from '../lib/format';

interface ArticleCardProps {
    article: Article;
    /** Position in the list, used by keyboard navigation (j/k). */
    index: number;
    isCurrent?: boolean;
    onOpen: (article: Article) => void;
    onToggleRead: (article: Article) => void;
    onToggleFavorite: (article: Article) => void;
}

/** Initial-letter cover used when a feed provides no image (no third-party fallback). */
function CoverFallback({ title, feed }: { title: string; feed?: string }) {
    return (
        <div className="w-full h-full bg-gradient-to-br from-nature/90 to-nature-dark flex items-end p-5">
            <span className="font-serif italic text-on-nature/90 text-lg leading-snug line-clamp-3">{feed || title}</span>
        </div>
    );
}

function ArticleCardImpl({ article, index, isCurrent, onOpen, onToggleRead, onToggleFavorite }: ArticleCardProps) {
    const [offset, setOffset] = useState(0);
    const [imgFailed, setImgFailed] = useState(false);

    // Touch-only swipe: right = read/unread, left = favorite. Mouse drags (text
    // selection) never trigger it.
    const swipe = useSwipeable({
        onSwiping: (e) => {
            if (e.dir === 'Left' || e.dir === 'Right') setOffset(Math.max(-110, Math.min(110, e.deltaX)));
        },
        onSwiped: (e) => {
            if (e.deltaX > 90) onToggleRead(article);
            else if (e.deltaX < -90) onToggleFavorite(article);
            setOffset(0);
        },
        trackMouse: false,
        delta: 30,
        preventScrollOnSwipe: false,
    });

    const showImage = article.image_url && !imgFailed;
    const date = article.published_at || article.created_at;

    return (
        <div className="relative cv-auto" data-index={index}>
            {/* Swipe hints behind the card */}
            <div className="absolute inset-0 flex items-center justify-between px-6 pointer-events-none" aria-hidden="true">
                <span className={`chip transition-opacity ${offset > 20 ? 'opacity-100' : 'opacity-0'}`}>
                    {article.is_read ? 'Non lu' : 'Lu'}
                </span>
                <span className={`chip bg-earth/15 text-earth transition-opacity ${offset < -20 ? 'opacity-100' : 'opacity-0'}`}>
                    Favori
                </span>
            </div>

            <article
                {...swipe}
                className={`group relative z-10 flex flex-col h-full overflow-hidden rounded-2xl bg-carbon-light border transition-[border-color,box-shadow,opacity]
                    ${article.is_read ? 'border-paper-muted/10' : 'border-nature/25'}
                    ${isCurrent ? 'ring-2 ring-nature ring-offset-2 ring-offset-carbon' : ''}
                    hover:border-nature/45 focus-within:border-nature/45`}
                style={{
                    transform: offset ? `translateX(${offset}px)` : undefined,
                    transition: offset ? 'none' : 'transform 0.35s cubic-bezier(0.22,1,0.36,1)',
                    boxShadow: 'var(--shadow-soft)',
                }}
            >
                {/* Cover */}
                <div className={`aspect-[16/9] overflow-hidden relative bg-carbon-dark ${article.is_read ? 'opacity-75' : ''}`}>
                    {showImage ? (
                        <img
                            src={article.image_url}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            width={640}
                            height={360}
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                            onError={() => setImgFailed(true)}
                        />
                    ) : (
                        <CoverFallback title={article.title} feed={article.feed_title} />
                    )}
                    <span className="absolute bottom-3 left-3 chip bg-carbon-light/95 shadow-sm max-w-[75%] truncate">
                        {article.feed_title || 'Journal'}
                    </span>
                    {!article.is_read && (
                        <div className="absolute top-0 right-0 w-24 h-24 overflow-hidden pointer-events-none" aria-hidden="true">
                            <span className="absolute top-[18px] -right-[34px] w-[140px] rotate-45 bg-nature text-on-nature text-[11px] font-extrabold uppercase tracking-[0.18em] text-center py-1.5 shadow-lg shadow-black/20">
                                Nouveau
                            </span>
                        </div>
                    )}
                </div>

                {/* Body */}
                <div className="flex-1 flex flex-col gap-2.5 px-5 pt-4 pb-2">
                    <h2
                        className={`text-xl font-serif leading-snug text-balance transition-colors group-hover:text-nature
                            ${article.is_read ? 'text-paper-muted font-normal' : 'text-paper-white font-semibold'}`}
                    >
                        {/* Stretched button: the whole card is clickable and keyboard-focusable. */}
                        <button
                            type="button"
                            onClick={() => onOpen(article)}
                            className="text-left after:absolute after:inset-0 after:z-0 focus-visible:outline-none"
                        >
                            {!article.is_read && <span className="sr-only">Non lu : </span>}
                            {article.title}
                        </button>
                    </h2>

                    {article.ai_summary ? (
                        <p className="text-paper-muted text-sm leading-relaxed line-clamp-3 font-reading">
                            <span className="text-nature font-semibold not-italic">✨ </span>
                            {article.ai_summary}
                        </p>
                    ) : article.excerpt ? (
                        <p className="text-paper-muted text-sm leading-relaxed line-clamp-3 font-reading">{article.excerpt}</p>
                    ) : null}

                    <div className="mt-auto flex items-center justify-between pt-2 border-t border-paper-muted/10">
                        <p className="text-xs text-paper-muted">
                            <time dateTime={date}>{formatRelative(date)}</time>
                            <span aria-hidden="true"> · </span>
                            {readingTimeLabel(article.reading_time)}
                        </p>
                        <div className="relative z-10 flex items-center -mr-2">
                            <button
                                onClick={() => onToggleRead(article)}
                                className="w-11 h-11 inline-flex items-center justify-center rounded-full text-nature hover:bg-nature/10 transition-colors"
                                title={article.is_read ? 'Marquer comme non lu (m)' : 'Marquer comme lu (m)'}
                                aria-label={article.is_read ? 'Marquer comme non lu' : 'Marquer comme lu'}
                            >
                                <svg className="w-[18px] h-[18px]" fill={article.is_read ? 'none' : 'currentColor'} viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                    <circle cx="12" cy="12" r="5" strokeWidth={1.8} />
                                </svg>
                            </button>
                            <button
                                onClick={() => onToggleFavorite(article)}
                                className={`w-11 h-11 inline-flex items-center justify-center rounded-full transition-colors ${article.is_favorite ? 'text-earth' : 'text-paper-muted hover:text-earth hover:bg-earth/10'}`}
                                title={article.is_favorite ? 'Retirer des favoris (s)' : 'Ajouter aux favoris (s)'}
                                aria-label="Favori"
                                aria-pressed={article.is_favorite}
                            >
                                <svg className="w-[18px] h-[18px]" fill={article.is_favorite ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </article>
        </div>
    );
}

/** Memoised: a card re-renders only when its own article object changes. */
export const ArticleCard = memo(ArticleCardImpl);
