import type { Article } from '../../api/articles';
import { formatRelative, readingTimeLabel } from '../../lib/format';
import { summaryText } from '../../lib/summary';

interface FocusCardProps {
    article: Article;
    isTop?: boolean;
}

export function FocusCard({ article, isTop = false }: FocusCardProps) {
    const date = article.published_at || article.created_at;

    return (
        <article className="w-full h-full bg-carbon-light border border-line rounded-[26px] overflow-hidden flex flex-col relative select-none">
            {/* Cover */}
            <div className="h-[44%] relative overflow-hidden bg-carbon-dark shrink-0">
                {article.image_url ? (
                    <img
                        src={article.image_url}
                        alt=""
                        draggable={false}
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover pointer-events-none"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                ) : (
                    <div className="w-full h-full bg-nature-soft p-8 flex items-end">
                        <span className="text-2xl font-serif font-semibold text-nature leading-tight line-clamp-3">{article.feed_title}</span>
                    </div>
                )}
                <span className="absolute top-4 right-4 bg-black/55 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
                    {readingTimeLabel(article.reading_time)}
                </span>
            </div>

            {/* Body */}
            <div className="flex-1 p-5 sm:p-6 flex flex-col min-h-0">
                <div className="flex items-center justify-between gap-3 mb-3 text-xs text-paper-muted">
                    <span className="flex items-center gap-2 text-nature font-semibold truncate">
                        <span className="w-1.5 h-1.5 rounded-full bg-nature shrink-0" aria-hidden="true" />
                        <span className="truncate">{article.feed_title || 'Journal'}</span>
                    </span>
                    <time dateTime={date} className="shrink-0">{formatRelative(date)}</time>
                </div>

                <h2 className="text-2xl font-semibold text-paper-white leading-[1.15] tracking-[-0.01em] mb-3 line-clamp-3 text-balance">
                    {article.title}
                </h2>

                {(article.ai_summary || article.excerpt) && (
                    <p className="text-paper-muted text-base leading-normal line-clamp-4 font-reading">
                        {article.ai_summary ? summaryText(article.ai_summary) : article.excerpt}
                    </p>
                )}

                {isTop && (
                    <p className="mt-auto pt-3 text-center text-xs text-paper-muted">
                        ← Plus tard · Lu → · Entrée pour lire
                    </p>
                )}
            </div>
        </article>
    );
}
