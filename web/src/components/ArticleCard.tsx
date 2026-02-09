import { useState } from 'react';
import { useSwipeable } from 'react-swipeable';
import { type Article, articlesApi } from '../api/articles';

interface ArticleCardProps {
    article: Article;
    onClick: (article: Article) => void;
    onToggleRead: (id: string, is_read: boolean) => void;
    onToggleFavorite: (id: string) => void;
}

export function ArticleCard({ article, onClick, onToggleRead, onToggleFavorite }: ArticleCardProps) {
    const [swipeOffset, setSwipeOffset] = useState(0);
    const [isSwiping, setIsSwiping] = useState(false);
    const [isSummarizing, setIsSummarizing] = useState(false);

    const handlers = useSwipeable({
        onSwiping: (event) => {
            const offset = event.deltaX;
            // Limit swipe to 80px
            if (Math.abs(offset) < 100) {
                setSwipeOffset(offset);
                setIsSwiping(true);
            }
        },
        onSwipedRight: () => {
            if (swipeOffset > 50) {
                onToggleRead(article.id, !article.is_read);
            }
            resetSwipe();
        },
        onSwipedLeft: () => {
            if (swipeOffset < -50) {
                onToggleFavorite(article.id);
            }
            resetSwipe();
        },
        onSwiped: () => resetSwipe(),
        trackMouse: true,
        preventScrollOnSwipe: true,
        delta: 10,
    });

    const resetSwipe = () => {
        setSwipeOffset(0);
        setIsSwiping(false);
    };

    const handleSummarize = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (article.ai_summary || isSummarizing) return;

        setIsSummarizing(true);
        try {
            await articlesApi.summarize(article.id);
            // The article will be updated via WebSocket broadcast
        } catch (error) {
            console.error('Failed to summarize:', error);
            alert('Erreur lors de la génération du résumé. Vérifiez votre clé API OpenRouter.');
        } finally {
            setIsSummarizing(false);
        }
    };

    return (
        <div className="relative overflow-visible pb-4">
            {/* Action Layers behind the card */}
            <div className="absolute inset-0 flex items-center justify-between px-6 pointer-events-none">
                {/* Left side swipe (Mark as Read) */}
                <div className={`flex items-center space-x-2 transition-opacity duration-300 ${swipeOffset > 10 ? 'opacity-100' : 'opacity-0'}`}>
                    <div className="bg-nature text-white p-2 rounded-full shadow-lg">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <span className="text-nature font-black text-[10px] uppercase tracking-widest">
                        {article.is_read ? 'Marquer non lu' : 'Marquer lu'}
                    </span>
                </div>

                {/* Right side swipe (Favorite) */}
                <div className={`flex items-center space-x-2 transition-opacity duration-300 ${swipeOffset < -10 ? 'opacity-100' : 'opacity-0'}`}>
                    <span className="text-earth font-black text-[10px] uppercase tracking-widest">Favori</span>
                    <div className="bg-earth text-white p-2 rounded-full shadow-lg">
                        <svg className="w-6 h-6" fill={article.is_favorite ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                    </div>
                </div>
            </div>

            {/* Main Interactive Card */}
            <article
                {...handlers}
                className={`magazine-card group cursor-pointer flex flex-col h-full relative z-10 bg-white dark:bg-carbon overflow-visible rounded-xl border border-carbon-dark/30 dark:border-white/5 transition-all ${isSwiping ? '' : 'duration-500 ease-out'} hover:border-nature/20`}
                style={{
                    transform: `translateX(${swipeOffset}px)`,
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.1)'
                }}
                onClick={() => !isSwiping && Math.abs(swipeOffset) < 5 && onClick(article)}
            >

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
                <div className="aspect-[16/9] overflow-hidden rounded-t-xl rounded-b-none bg-carbon relative mb-4">


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
                        <span className="bg-white px-2 py-1 rounded shadow-sm border border-nature/5 text-[10px] text-nature font-black uppercase tracking-[.25em] drop-shadow-sm">
                            {article.feed_title || 'Journal'}
                        </span>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 flex flex-col px-5 gap-3">
                    <h2 className={`text-2xl font-serif leading-snug transition-colors duration-300 group-hover:text-nature-light ${article.is_read ? 'text-paper-muted font-normal' : 'text-paper-white font-black'}`}
                    >
                        {article.title}
                    </h2>

                    {article.ai_summary ? (
                        <div className="flex items-center space-x-2 text-nature/80">
                            <span className="text-sm px-2 py-0.5 bg-nature/10 rounded-full font-medium flex items-center">
                                <span className="mr-1">✨</span> Smart Digest prêt
                            </span>
                        </div>
                    ) : article.summary && (
                        <p className="text-paper-muted/90 text-sm leading-relaxed line-clamp-2 font-reading group-hover:text-paper-white transition-colors">
                            {article.summary.replace(/<[^>]*>?/gm, '').substring(0, 120)}...
                        </p>
                    )}

                    <div className="mt-auto flex items-center justify-between pt-4 pb-5 border-t border-carbon-dark/20 dark:border-white/5">
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
                            <button
                                onClick={handleSummarize}
                                disabled={isSummarizing || !!article.ai_summary}
                                className={`p-1.5 rounded-full transition-all duration-300 flex items-center justify-center ${article.ai_summary
                                    ? 'text-nature bg-nature/10 opacity-50 cursor-default'
                                    : isSummarizing
                                        ? 'text-nature animate-pulse'
                                        : 'text-paper-muted hover:text-nature hover:bg-nature/10'}`}
                                title={article.ai_summary ? "Résumé généré" : "Générer un résumé IA (Smart Digest)"}
                            >
                                {isSummarizing ? (
                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                ) : (
                                    <span className="text-sm leading-none">✨</span>
                                )}
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
        </div>
    );
}
