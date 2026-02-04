import type { Article } from '../api/articles';

interface ArticleCardProps {
    article: Article;
    onClick: (article: Article) => void;
    onToggleRead: (id: string, is_read: boolean) => void;
    onToggleFavorite: (id: string) => void;
}

export function ArticleCard({ article, onClick, onToggleRead, onToggleFavorite }: ArticleCardProps) {
    // Simulate a "reading time" based on typical RSS snippet length
    const readTime = Math.max(1, Math.ceil((article.content?.length || 500) / 1000));

    return (
        <article
            className={`magazine-card group cursor-pointer flex flex-col h-full bg-carbon-light transition-all duration-500 overflow-hidden relative shadow-lg hover:gold-glow ${!article.is_read ? 'border-gold/30' : 'border-transparent opacity-90'
                }`}
            onClick={() => onClick(article)}
        >
            <div className="aspect-[16/10] overflow-hidden bg-carbon-dark relative">
                {/* Fallback pattern for articles without images */}
                <div className="absolute inset-0 bg-gradient-to-br from-carbon-light to-carbon-dark opacity-40 group-hover:opacity-20 transition-opacity" />
                <div className="absolute inset-0 flex items-center justify-center opacity-10 group-hover:scale-110 transition-transform duration-700">
                    <span className="text-4xl font-serif text-gold underline italic">F</span>
                </div>

                {!article.is_read && (
                    <div className="absolute top-4 right-4 w-2 h-2 bg-gold rounded-full gold-glow animate-pulse z-10" />
                )}
            </div>

            <div className="p-6 flex flex-col flex-1">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-gold font-bold truncate max-w-[70%]">
                        {article.feed_title || 'Source'}
                    </span>
                    <span className="text-[10px] text-paper-muted uppercase tracking-wider font-sans">
                        {readTime} MIN READ
                    </span>
                </div>

                <h2 className="text-xl font-serif text-paper-white group-hover:text-gold transition-colors duration-300 leading-tight mb-4 flex-1">
                    {article.title}
                </h2>

                <div className="flex items-center justify-between pt-4 border-t border-carbon-dark/50">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(article.id);
                        }}
                        className={`text-xl transition-all duration-300 transform hover:scale-125 ${article.is_favorite ? 'text-gold' : 'text-paper-muted hover:text-gold opacity-30 hover:opacity-100'
                            }`}
                    >
                        {article.is_favorite ? '★' : '☆'}
                    </button>

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleRead(article.id, article.is_read);
                        }}
                        className={`text-[10px] uppercase tracking-widest font-bold transition-all duration-300 ${article.is_read ? 'text-paper-muted hover:text-paper-white' : 'text-gold hover:brightness-125'
                            }`}
                    >
                        {article.is_read ? 'Lu' : 'Marquer lu'}
                    </button>
                </div>
            </div>
        </article>
    );
}
