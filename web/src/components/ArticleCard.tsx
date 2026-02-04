import type { Article } from '../api/articles';

interface ArticleCardProps {
    article: Article;
    onClick: (article: Article) => void;
    onToggleRead: (id: string, is_read: boolean) => void;
    onToggleFavorite: (id: string) => void;
}

export function ArticleCard({ article, onClick, onToggleRead, onToggleFavorite }: ArticleCardProps) {
    const timeToRead = Math.ceil((article.content?.length || 500) / 1000) + 1;

    return (
        <article className="magazine-card group cursor-pointer break-inside-avoid mb-8" onClick={() => onClick(article)}>
            {/* Image Placeholder with Gold Overlay */}
            <div className="aspect-[16/10] overflow-hidden rounded-xl bg-carbon-light relative mb-6">
                <div className="absolute inset-0 bg-gradient-to-t from-carbon-dark/80 via-transparent to-transparent opacity-60 z-10"></div>

                {/* Visual placeholder or real image */}
                <div
                    className="w-full h-full bg-cover bg-center transition-transform duration-700 group-hover:scale-105 opacity-60"
                    style={{
                        backgroundImage: `url(${article.image_url || 'https://images.unsplash.com/photo-1586339949916-3e9457bef6d3?auto=format&fit=crop&q=80&w=800'})`,
                        backgroundColor: '#1e1e1e'
                    }}
                ></div>

                {/* Meta on top of image */}
                <div className="absolute bottom-4 left-4 right-4 z-20 flex justify-between items-end">
                    <span className="text-[10px] text-gold-bright uppercase tracking-[.25em] font-black drop-shadow-md">
                        {article.feed_title || 'Journal'}
                    </span>
                    <span className="text-[10px] text-paper-muted uppercase tracking-widest font-bold">
                        {timeToRead} min
                    </span>
                </div>
            </div>

            {/* Content */}
            <div className="space-y-4 px-1">
                <h2 className={`text-xl font-serif italic transition-colors duration-300 group-hover:text-gold ${article.is_read ? 'text-paper-muted font-normal' : 'text-paper-white font-bold'}`}>
                    {article.title}
                </h2>

                {article.summary && (
                    <p className="text-paper-muted text-sm leading-relaxed line-clamp-3 font-reading opacity-80 decoration-gold/0 group-hover:opacity-100 transition-opacity">
                        {article.summary.replace(/<[^>]*>?/gm, '').substring(0, 160)}...
                    </p>
                )}

                <div className="flex items-center justify-between pt-2">
                    <div className="flex space-x-4">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleRead(article.id, !article.is_read);
                            }}
                            className={`p-1.5 rounded-full transition-all duration-300 ${article.is_read ? 'text-gold/40 border border-gold/10' : 'text-gold hover:bg-gold/10 border border-transparent hover:border-gold/20'}`}
                            title={article.is_read ? "Marquer comme non lu" : "Marquer comme lu"}
                        >
                            <svg className="w-4 h-4" fill={article.is_read ? "none" : "currentColor"} viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                            </svg>
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleFavorite(article.id);
                            }}
                            className={`p-1.5 rounded-full transition-all duration-300 ${article.is_favorite ? 'text-gold gold-glow' : 'text-paper-muted hover:text-gold hover:bg-gold/10'}`}
                            title="Ajouter aux favoris"
                        >
                            <svg className="w-4 h-4" fill={article.is_favorite ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </article>
    );
}
