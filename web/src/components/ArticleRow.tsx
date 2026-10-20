import { memo, useState } from 'react';
import { useSwipeable } from 'react-swipeable';
import type { Article } from '../api/articles';
import { formatRelative, readingTimeLabel } from '../lib/format';
import { FeedAvatar } from './FeedAvatar';
import { Icon } from './Icon';
import { summaryText } from '../lib/summary';

interface ArticleRowProps {
    article: Article;
    /** Position in the list, used by keyboard navigation (j/k). */
    index: number;
    /** Open in the reader pane right now. */
    selected?: boolean;
    onOpen: (article: Article) => void;
    onToggleRead: (article: Article) => void;
    onToggleFavorite: (article: Article) => void;
}

const SWIPE_MAX = 112;
const SWIPE_TRIGGER = 88;

function Thumb({ article }: { article: Article }) {
    const [failed, setFailed] = useState(false);
    const [loaded, setLoaded] = useState(false);
    if (!article.image_url || failed) return null;
    return (
        <span className={`shrink-0 w-[76px] h-[76px] md:w-16 md:h-16 rounded-xl overflow-hidden bg-carbon-dark ${article.is_read ? 'opacity-70' : ''}`}>
            <img
                src={article.image_url}
                alt=""
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                width={152}
                height={152}
                className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
                onLoad={() => setLoaded(true)}
                onError={() => setFailed(true)}
            />
        </span>
    );
}

/**
 * One article in the list: source, title, summary hint and a square thumbnail.
 * Touch swipe → marks read / unread, ← toggles favorite; the action shows
 * behind the row while dragging.
 */
function ArticleRowImpl({ article, index, selected, onOpen, onToggleRead, onToggleFavorite }: ArticleRowProps) {
    const [offset, setOffset] = useState(0);

    const swipe = useSwipeable({
        onSwiping: (e) => {
            if (e.dir === 'Left' || e.dir === 'Right') setOffset(Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, e.deltaX)));
        },
        onSwiped: (e) => {
            if (e.deltaX > SWIPE_TRIGGER) onToggleRead(article);
            else if (e.deltaX < -SWIPE_TRIGGER) onToggleFavorite(article);
            setOffset(0);
        },
        trackMouse: false,
        delta: 24,
        preventScrollOnSwipe: false,
    });

    const unread = !article.is_read;
    const date = article.published_at || article.created_at;
    const armed = Math.abs(offset) > SWIPE_TRIGGER;

    return (
        <div className="relative cv-row border-b border-line overflow-hidden" data-index={index}>
            {/* Action revealed behind the row while swiping */}
            {offset !== 0 && (
                <div
                    aria-hidden="true"
                    className={`absolute inset-0 flex items-center px-6 text-xs font-bold ${
                        offset > 0 ? 'justify-start bg-nature text-on-nature' : 'justify-end bg-earth text-on-earth'
                    }`}
                >
                    <span className={`flex flex-col items-center gap-1 transition-transform ${armed ? 'scale-110' : 'scale-90 opacity-80'}`}>
                        <Icon name={offset > 0 ? 'check' : 'star'} size={24} strokeWidth={2.2} filled={offset < 0 && !article.is_favorite} />
                        {offset > 0 ? (article.is_read ? 'Non lu' : 'Lu') : article.is_favorite ? 'Retirer' : 'Favori'}
                    </span>
                </div>
            )}

            <article
                {...swipe}
                className={`group relative flex items-start gap-3 pl-3 pr-4 py-3.5 transition-colors ${
                    selected ? 'bg-select' : 'bg-carbon-light hover:bg-carbon'
                }`}
                style={{
                    transform: offset ? `translateX(${offset}px)` : undefined,
                    transition: offset ? 'none' : 'transform 0.3s cubic-bezier(0.2,0.8,0.2,1), background-color 0.15s',
                }}
            >
                <span aria-hidden="true" className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${unread ? 'bg-nature' : ''}`} />

                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                    <p className="flex items-center gap-1.5 text-xs text-paper-muted min-w-0">
                        <FeedAvatar id={article.feed_id} title={article.feed_title} size={16} />
                        <span className="font-semibold text-paper-white truncate">{article.feed_title || 'Journal'}</span>
                        <span aria-hidden="true">·</span>
                        <time dateTime={date} className="shrink-0">{formatRelative(date)}</time>
                    </p>

                    <h2
                        className={`font-serif text-[17px] max-md:text-[18px] leading-[1.28] line-clamp-3 text-pretty ${
                            unread ? 'font-semibold text-paper-white' : 'font-medium text-paper-muted'
                        }`}
                    >
                        {/* Stretched button: the whole row opens the article and is keyboard-focusable. */}
                        <button
                            type="button"
                            onClick={() => onOpen(article)}
                            aria-current={selected || undefined}
                            className="text-left after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                        >
                            {unread && <span className="sr-only">Non lu : </span>}
                            {article.title}
                        </button>
                    </h2>

                    {(article.ai_summary || article.excerpt) && (
                        <p className="hidden md:block text-[13px] leading-[1.45] text-paper-muted line-clamp-2">{article.ai_summary ? summaryText(article.ai_summary) : article.excerpt}</p>
                    )}

                    <p className="flex items-center gap-2 text-xs text-paper-muted">
                        {article.ai_summary && (
                            <span className="chip !py-0.5 !px-2 !text-[11px]">
                                <Icon name="sparkle" size={12} strokeWidth={2} />
                                Résumé IA
                            </span>
                        )}
                        <span>{readingTimeLabel(article.reading_time)}</span>
                        {article.is_favorite && <Icon name="star" size={14} filled className="text-earth" label="Favori" />}
                    </p>
                </div>

                <Thumb article={article} />

                {/* Desktop quick actions, shown on hover / focus */}
                <div className="hidden md:flex absolute right-3 bottom-2 z-10 items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity bg-carbon-light/95 rounded-xl shadow-[var(--shadow-soft)]">
                    <button
                        onClick={() => onToggleRead(article)}
                        className="tool-btn !w-9 !h-9"
                        title={article.is_read ? 'Marquer comme non lu (m)' : 'Marquer comme lu (m)'}
                        aria-label={article.is_read ? 'Marquer comme non lu' : 'Marquer comme lu'}
                    >
                        <Icon name="check" size={17} />
                    </button>
                    <button
                        onClick={() => onToggleFavorite(article)}
                        className={`tool-btn !w-9 !h-9 ${article.is_favorite ? '!text-earth' : ''}`}
                        title={article.is_favorite ? 'Retirer des favoris (s)' : 'Ajouter aux favoris (s)'}
                        aria-label="Favori"
                        aria-pressed={article.is_favorite}
                    >
                        <Icon name="star" size={17} filled={article.is_favorite} />
                    </button>
                </div>
            </article>
        </div>
    );
}

/** Memoised: a row re-renders only when its own article or selection changes. */
export const ArticleRow = memo(ArticleRowImpl);
