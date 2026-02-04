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
        <article className="magazine-card group cursor-pointer flex flex-col h-full relative overflow-visible shadow-xl shadow-paper-muted/20 hover:shadow-2xl hover:shadow-gold/20 transition-all duration-500 rounded-xl border border-transparent hover:border-gold/10" onClick={() => onClick(article)}>

            {/* Unread Ribbon - "Paper Corner" Effect */}
            {/* Unread Ribbon - Wrapping "Paper Corner" Effect */}
            {!article.is_read && (
                <div className="absolute -top-2 -right-2 z-50 w-28 h-28 overflow-hidden pointer-events-none">
                    {/* Ribbon */}
                    <div className="absolute top-0 right-0 bg-gold text-carbon text-[10px] font-extrabold uppercase tracking-widest py-1.5 w-[140%] text-center transform translate-x-[35%] translate-y-[20%] rotate-45 shadow-lg shadow-black/20 border-b border-white/10">
                        Non Lu
                    </div>
                    {/* Darker Folds for "Wrapping" Effect */}
                    <div className="absolute top-0 left-[2.9rem] w-2 h-2 bg-yellow-900 rotate-45 transform translate-x-0.5 -translate-y-1 z-[-1]"></div>
                    <div className="absolute bottom-[2.9rem] right-0 w-2 h-2 bg-yellow-900 rotate-45 transform translate-x-1 -translate-y-0.5 z-[-1]"></div>
                </div>
            )}
            {!article.is_read && (
                /* External folds to complete the "behind" illusion if sticking out */
                <>
                    <div className="absolute -top-[5px] right-[58px] w-2 h-2 bg-yellow-800 rotate-45 z-40"></div>
                    <div className="absolute top-[58px] -right-[5px] w-2 h-2 bg-yellow-800 rotate-45 z-40"></div>
                </>
            )}

            {/* Image Placeholder with Gold Overlay */}
            <div className="aspect-[16/10] overflow-hidden rounded-xl bg-carbon-light relative mb-6">
                <div className="absolute inset-0 bg-gradient-to-t from-carbon-dark/80 via-transparent to-transparent opacity-60 z-10"></div>

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
                <h2 className={`text-xl font-serif italic transition-colors duration-300 group-hover:text-gold ${article.is_read ? 'text-paper-muted font-normal' : 'text-paper-white font-bold'}`}
                    style={article.is_read ? {} : { textShadow: '0 1px 1px rgba(0,0,0,0.1)' }}
                >
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
                            className={`p-1.5 rounded-full transition-all duration-300 border ${article.is_read ? 'text-gold/40 border-gold/10' : 'text-gold bg-gold/5 border-paper-white/40 hover:bg-gold/20 hover:border-paper-white'}`}
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
