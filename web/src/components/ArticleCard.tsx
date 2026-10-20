import { memo, useState } from 'react';
import { useSwipeable } from 'react-swipeable';
import type { Article } from '../api/articles';
import { formatRelative, readingTimeLabel } from '../lib/format';
import { FeedAvatar } from './FeedAvatar';
import { Icon } from './Icon';
import { summaryText } from '../lib/summary';

interface ArticleCardProps {
    article: Article;
    /** Position in the list, used by keyboard navigation (j/k). */
    index: number;
    onOpen: (article: Article) => void;
    onToggleRead: (article: Article) => void;
    onToggleFavorite: (article: Article) => void;
}

/** Initial-letter cover used when a feed provides no image (no third-party fallback). */
function CoverFallback({ title, feed }: { title: string; feed?: string }) {
    const initial = (feed || title).trim().charAt(0).toUpperCase();
    return (
        <div className="w-full h-full bg-nature-soft flex items-center justify-center" aria-hidden="true">
            <span className="font-serif text-nature/50 text-7xl leading-none select-none">{initial}</span>
        </div>
    );
}

/** Magazine view: a card with a large cover. Same gestures as the list rows. */
function ArticleCardImpl({ article, index, onOpen, onToggleRead, onToggleFavorite }: ArticleCardProps) {
    const [offset, setOffset] = useState(0);
    const [imgFailed, setImgFailed] = useState(false);
    const [imgLoaded, setImgLoaded] = useState(false);

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
    const unread = !article.is_read;

    return (
        <div className="relative cv-auto" data-index={index}>
            {/* Swipe hints behind the card */}
            <div className="absolute inset-0 flex items-center justify-between px-6 pointer-events-none" aria-hidden="true">
                <span className={`chip transition-opacity ${offset > 20 ? 'opacity-100' : 'opacity-0'}`}>
                    {article.is_read ? 'Non lu' : 'Lu'}
                </span>
                <span className={`chip !bg-earth/15 !text-earth transition-opacity ${offset < -20 ? 'opacity-100' : 'opacity-0'}`}>
                    Favori
                </span>
            </div>

            <article
                {...swipe}
                className="group relative z-10 flex flex-col h-full overflow-hidden rounded-2xl bg-carbon-light border border-line transition-[border-color,box-shadow] hover:border-nature/40 focus-within:border-nature/40"
                style={{
                    transform: offset ? `translateX(${offset}px)` : undefined,
                    transition: offset ? 'none' : 'transform 0.35s cubic-bezier(0.2,0.8,0.2,1)',
                }}
            >
                {/* Cover */}
                <div className={`aspect-[16/10] overflow-hidden relative bg-carbon-dark ${article.is_read ? 'opacity-70' : ''}`}>
                    {showImage ? (
                        <img
                            src={article.image_url}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            width={640}
                            height={400}
                            className={`w-full h-full object-cover transition-[transform,opacity] duration-700 group-hover:scale-[1.03] ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
                            onLoad={() => setImgLoaded(true)}
                            onError={() => setImgFailed(true)}
                        />
                    ) : (
                        <CoverFallback title={article.title} feed={article.feed_title} />
                    )}
                </div>

                {/* Body */}
                <div className="flex-1 flex flex-col gap-2 px-[18px] pt-4 pb-1.5">
                    <p className="flex items-center gap-1.5 text-xs text-paper-muted min-w-0">
                        <span aria-hidden="true" className={`w-[7px] h-[7px] rounded-full shrink-0 ${unread ? 'bg-nature' : ''}`} />
                        <FeedAvatar id={article.feed_id} title={article.feed_title} size={16} />
                        <span className="font-semibold text-paper-white truncate">{article.feed_title || 'Journal'}</span>
                        <span aria-hidden="true">·</span>
                        <time dateTime={date} className="shrink-0">{formatRelative(date)}</time>
                    </p>

                    <h2
                        className={`text-xl font-serif leading-[1.25] text-balance transition-colors group-hover:text-nature
                            ${unread ? 'text-paper-white font-semibold' : 'text-paper-muted font-medium'}`}
                    >
                        {/* Stretched button: the whole card is clickable and keyboard-focusable. */}
                        <button
                            type="button"
                            onClick={() => onOpen(article)}
                            className="text-left after:absolute after:inset-0 after:z-0 focus-visible:outline-none"
                        >
                            {unread && <span className="sr-only">Non lu : </span>}
                            {article.title}
                        </button>
                    </h2>

                    {(article.ai_summary || article.excerpt) && (
                        <p className="text-paper-muted text-[13px] leading-relaxed line-clamp-3">{article.ai_summary ? summaryText(article.ai_summary) : article.excerpt}</p>
                    )}

                    <div className="mt-auto flex items-center gap-2 pt-1 text-xs text-paper-muted">
                        {article.ai_summary && (
                            <span className="chip !py-0.5 !px-2 !text-[11px]">
                                <Icon name="sparkle" size={12} strokeWidth={2} />
                                Résumé IA
                            </span>
                        )}
                        <span>{readingTimeLabel(article.reading_time)}</span>
                        <span className="flex-1" />
                        <div className="relative z-10 flex items-center -mr-2">
                            <button
                                onClick={() => onToggleRead(article)}
                                className="tool-btn"
                                title={article.is_read ? 'Marquer comme non lu (m)' : 'Marquer comme lu (m)'}
                                aria-label={article.is_read ? 'Marquer comme non lu' : 'Marquer comme lu'}
                            >
                                <Icon name="check" size={18} />
                            </button>
                            <button
                                onClick={() => onToggleFavorite(article)}
                                className={`tool-btn ${article.is_favorite ? '!text-earth' : ''}`}
                                title={article.is_favorite ? 'Retirer des favoris (s)' : 'Ajouter aux favoris (s)'}
                                aria-label="Favori"
                                aria-pressed={article.is_favorite}
                            >
                                <Icon name="star" size={18} filled={article.is_favorite} />
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
