import type { Article } from '../../api/articles';

interface FocusCardProps {
    article: Article;
    isTop?: boolean;
}

export function FocusCard({ article, isTop = false }: FocusCardProps) {
    const timeToRead = article.content ? Math.max(1, Math.ceil(article.content.length / 1000)) : 1;
    const excerpt = article.summary ? article.summary.replace(/<[^>]*>?/gm, '').slice(0, 150) : '';

    return (
        <article className="w-full h-full bg-carbon-light rounded-3xl overflow-hidden flex flex-col relative select-none cursor-grab active:cursor-grabbing">
            {/* Cover (60%) */}
            <div className="h-[58%] relative overflow-hidden">
                {article.image_url ? (
                    <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url(${article.image_url})` }} />
                ) : (
                    <div className="w-full h-full bg-gradient-to-br from-nature to-nature-light p-8 flex items-end">
                        <h2 className="text-3xl font-serif italic text-white/95 leading-tight line-clamp-4 drop-shadow">
                            {article.title}
                        </h2>
                    </div>
                )}
                <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/55 to-transparent pointer-events-none" />
                <span className="absolute top-4 right-4 bg-black/40 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border border-white/10">
                    ~{timeToRead} min
                </span>
            </div>

            {/* Body (40%) */}
            <div className="flex-1 p-6 flex flex-col">
                <div className="flex items-center justify-between mb-3 text-[10px] uppercase tracking-widest font-bold text-paper-muted/70">
                    <span className="flex items-center gap-2 text-nature">
                        <span className="w-1.5 h-1.5 rounded-full bg-nature" />
                        {article.feed_title || 'Journal'}
                    </span>
                    <span>
                        {new Date(article.published_at || article.created_at).toLocaleDateString('fr-FR', {
                            weekday: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                    </span>
                </div>

                {article.image_url && (
                    <h2 className="text-xl sm:text-2xl font-serif italic text-paper-white leading-tight mb-3 line-clamp-2">
                        {article.title}
                    </h2>
                )}

                {excerpt && (
                    <p className="text-paper-muted text-sm leading-relaxed line-clamp-3 font-reading">{excerpt}…</p>
                )}

                {isTop && (
                    <p className="mt-auto pt-4 text-center text-[10px] uppercase tracking-widest font-bold text-paper-muted/40 animate-pulse">
                        Double-clic pour lire · Glisser pour trier
                    </p>
                )}
            </div>
        </article>
    );
}
