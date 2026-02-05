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
        <article className="magazine-card group cursor-pointer flex flex-col h-full relative overflow-visible shadow-xl shadow-paper-muted/20 hover:shadow-2xl hover:shadow-nature/20 transition-all duration-500 rounded-xl border border-transparent hover:border-nature/10" onClick={() => onClick(article)}>

            {/* Unread Ribbon - Polished Wrapping Effect */}
            {!article.is_read && (
                <div className="absolute -top-2 -right-2 z-50 w-[100px] h-[100px] overflow-hidden pointer-events-none">
                    {/* The Ribbon Itself */}
                    <div className="absolute top-[22px] -right-[35px] w-[140px] bg-nature text-white text-[10px] font-extrabold uppercase tracking-widest py-1.5 text-center transform rotate-45 shadow-lg shadow-black/20 border-b border-white/10 flex items-center justify-center opacity-100 z-50">
                        Nouveau
                    </div>

                    {/* Darker Folds for "Wrapping" Effect (Simulated behind the card) */}
                    <div className="absolute top-0 left-[22px] w-3 h-3 bg-green-900 rotate-45 transform -translate-x-1/2 -translate-y-1/2 z-[-1]"></div>
                    <div className="absolute bottom-[22px] right-0 w-3 h-3 bg-green-900 rotate-45 transform translate-x-1/2 translate-y-1/2 z-[-1]"></div>
                </div>
            )}
            {!article.is_read && (
                /* External fold bits to cover the corner if needed for perfection */
                <>
                    <div className="absolute -top-[5px] right-[62px] w-2 h-2 bg-green-800 rotate-45 z-40 rounded-sm"></div>
                    <div className="absolute top-[62px] -right-[5px] w-2 h-2 bg-green-800 rotate-45 z-40 rounded-sm"></div>
                </>
            )}

            {/* Image Placeholder with Gradient Overlay */}
            <div className="aspect-[16/10] overflow-hidden rounded-t-xl rounded-b-none bg-carbon-light relative mb-6">
                {/* Gradient lowered to 50% height to avoid covering too much image */}
                <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-white via-white/80 to-transparent opacity-100 z-10"></div>

                {/* Visual placeholder or real image */}
                <div
                    className="w-full h-full bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                    style={{
                        backgroundImage: `url(${article.image_url || 'https://images.unsplash.com/photo-1586339949916-3e9457bef6d3?auto=format&fit=crop&q=80&w=800'})`,
                        backgroundColor: '#f0f0f0'
                    }}
                ></div>

                {/* Meta on top of image */}
                <div className="absolute bottom-4 left-4 right-4 z-20 flex justify-between items-end">
                    <span className="text-[10px] text-nature font-black uppercase tracking-[.25em] drop-shadow-sm">
                        {article.feed_title || 'Journal'}
                    </span>
                    <span className="text-[10px] text-nature/80 font-bold uppercase tracking-widest">
                        {timeToRead} min
                    </span>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 flex flex-col px-1 gap-4">
                <h2 className={`text-xl font-serif italic transition-colors duration-300 group-hover:text-nature-light ${article.is_read ? 'text-paper-muted font-normal' : 'text-paper-white font-bold'}`}
                    style={article.is_read ? {} : { textShadow: '0 1px 1px rgba(0,0,0,0.1)' }}
                >
                    {article.title}
                </h2>

                {article.summary && (
                    <p className="text-paper-muted text-sm leading-relaxed line-clamp-3 font-reading opacity-80 decoration-nature/0 group-hover:opacity-100 transition-opacity">
                        {article.summary.replace(/<[^>]*>?/gm, '').substring(0, 160)}...
                    </p>
                )}

                <div className="mt-auto flex items-center justify-between pt-4 pb-2 border-t border-white/5">
                    <div className="flex space-x-2">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleRead(article.id, !article.is_read);
                            }}
                            className={`p-1.5 rounded-full transition-all duration-300 border ${article.is_read ? 'text-nature/40 border-nature/10' : 'text-nature bg-nature/5 border-paper-white/40 hover:bg-nature/20 hover:border-nature'}`}
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
                            className={`p-1.5 rounded-full transition-all duration-300 ${article.is_favorite ? 'text-nature nature-glow' : 'text-paper-muted hover:text-nature hover:bg-nature/10'}`}
                            title="Ajouter aux favoris"
                        >
                            <svg className="w-4 h-4" fill={article.is_favorite ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                            </svg>
                        </button>
                    </div>

                    <span className="text-[10px] text-paper-muted/60 font-medium tracking-wide">
                        {new Date(article.published_at || article.created_at).toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                        })}
                    </span>
                </div>
            </div>
        </article>
    );
}
