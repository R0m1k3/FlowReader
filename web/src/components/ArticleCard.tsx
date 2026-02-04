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
            {!article.is_read && (
                <div className="absolute -top-1.5 -right-1.5 z-50 w-24 h-24 overflow-hidden pointer-events-none">
                    {/* The darker 'fold' triangle behind */}
                    <div className="absolute top-0 left-0 w-2 h-2 bg-yellow-900 rotate-45 transform translate-x-12 translate-y-[-4px]"></div>
                    <div className="absolute bottom-0 right-0 w-2 h-2 bg-yellow-900 rotate-45 transform translate-x-[4px] translate-y-[-12px]"></div>

                    {/* The Ribbon */}
                    <div className="absolute top-0 right-0 bg-gold text-carbon text-[10px] font-black uppercase tracking-widest py-1.5 w-32 text-center transform translate-x-[30%] translate-y-[45%] rotate-45 shadow-md border-b-[1px] border-white/20">
                        Non Lu
                    </div>
                    {/* Corner fold simulation (triangle darker) */}
                    <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-yellow-800/80"></div>
                    <div className="absolute bottom-[5.5rem] right-0 w-1.5 h-1.5 bg-yellow-800/80"></div>
                </div>
            )}
            {!article.is_read && (
                <>
                    {/* Top Triangle Fold */}
                    <div className="absolute -top-1.5 right-[5.25rem] w-1.5 h-1.5 bg-yellow-800 z-40 transform skew-x-45 md:hidden"></div>
                    {/* Right Triangle Fold */}
                    <div className="absolute top-[5.25rem] -right-1.5 w-1.5 h-1.5 bg-yellow-800 z-40 transform skew-y-45 md:hidden"></div>
                </>
            )}

            {/* Cleaner Implementation: Standard CSS Ribbon with ::before/::after simulated by small divs for the 'behind' effect */}
            {!article.is_read && (
                <div className="absolute -top-2 -right-2 z-40 w-[100px] h-[100px] overflow-hidden rounded-tr-xl">
                    {/* Ribbon background */}
                    <div className="absolute top-[19px] -right-[23px] w-[120px] bg-gold text-carbon text-[10px] font-black uppercase tracking-widest text-center py-1 rotate-45 shadow-sm border border-y-gold-light/20">
                        Non Lu
                    </div>
                </div>
            )}
            {/* Wait, the user wants 'pass behind'. That requires the ribbon to go OUTSIDE the box. 
                My previous 'overflow-hidden' container clips it inside.
                Let's use a non-clipped appraoch.
            */}
            {!article.is_read && (
                <div className="absolute top-0 right-0 z-50">
                    <div className="absolute top-0 right-0">
                        {/* Fold Triangles (The parts that look like they go behind) */}
                        <div className="absolute top-[-6px] right-[52px] w-0 h-0 border-l-[6px] border-l-transparent border-b-[6px] border-b-yellow-800 border-r-[6px] border-r-transparent transform rotate-[135deg]"></div>
                        <div className="absolute top-[52px] right-[-6px] w-0 h-0 border-l-[6px] border-l-transparent border-b-[6px] border-b-yellow-800 border-r-[6px] border-r-transparent transform rotate-[135deg]"></div>

                        {/* The main ribbon */}
                        <div className="absolute top-[-6px] right-[-6px] w-[80px] h-[80px] overflow-hidden">
                            <div className="absolute top-[18px] left-[-35px] w-[150px] bg-gold text-carbon text-[9px] font-black uppercase tracking-widest text-center py-1.5 transform rotate-45 shadow-[0_2px_4px_rgba(0,0,0,0.2)] border-t border-white/20">
                                Non Lu
                            </div>
                        </div>
                    </div>
                </div>
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
