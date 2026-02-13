import type { Article } from '../../api/articles';

interface FocusCardProps {
    article: Article;
    isTop?: boolean;
}

export function FocusCard({ article, isTop = false }: FocusCardProps) {
    const timeToRead = article.content
        ? Math.ceil(article.content.length / 1000)
        : 1;

    return (
        <article className="w-full h-full bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col relative select-none cursor-grab active:cursor-grabbing hover:scale-[1.01] transition-transform duration-300">
            {/* Image Section (Top 60%) */}
            <div className="h-[60%] relative bg-carbon-light overflow-hidden">
                {article.image_url ? (
                    <div
                        className="w-full h-full bg-cover bg-center transition-transform duration-700"
                        style={{ backgroundImage: `url(${article.image_url})` }}
                    />
                ) : (
                    /* Fallback Gradient if no image */
                    <div className="w-full h-full bg-gradient-to-br from-nature to-nature-light p-8 flex items-end">
                        <h1 className="text-3xl font-serif italic text-white/90 leading-tight line-clamp-4 drop-shadow-md">
                            {article.title}
                        </h1>
                    </div>
                )}

                {/* Overlay Gradient for text readability */}
                <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

                {/* Badge: Time to Read */}
                <div className="absolute top-4 right-4 bg-black/40 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border border-white/10 shadow-lg">
                    ~{timeToRead} min
                </div>
            </div>

            {/* Content Section (Bottom 40%) */}
            <div className="flex-1 p-6 flex flex-col bg-white relative">
                {/* Source & Date */}
                <div className="flex items-center justify-between mb-3 text-[10px] uppercase tracking-widest font-black text-paper-muted/60">
                    <span className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-nature"></span>
                        <span className="text-nature/80">
                            {article.feed_title || 'Journal'}
                        </span>
                    </span>
                    <span>
                        {new Date(article.published_at || article.created_at).toLocaleDateString('fr-FR', {
                            weekday: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                        })}
                    </span>
                </div>

                {/* Title (if image present, otherwise shown in gradient header) */}
                {article.image_url && (
                    <h2 className="text-xl sm:text-2xl font-serif italic text-paper-white leading-tight mb-3 line-clamp-2">
                        {article.title}
                    </h2>
                )}

                {/* Excerpt */}
                {article.summary && (
                    <p className="text-paper-muted text-sm leading-relaxed line-clamp-3 font-reading opacity-80 decoration-nature/20">
                        {article.summary.replace(/<[^>]*>?/gm, '').substring(0, 140)}...
                    </p>
                )}

                {/* Hint (only on top card) */}
                {isTop && (
                    <div className="mt-auto pt-4 text-center opacity-40 text-[10px] uppercase tracking-widest font-bold text-paper-muted animate-pulse">
                        Double-cliquer pour lire • Glisser pour trier
                    </div>
                )}
            </div>
        </article>
    );
}
