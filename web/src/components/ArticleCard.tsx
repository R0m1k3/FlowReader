import { useState } from 'react';
import { useSwipeable } from 'react-swipeable';
import { type Article, articlesApi } from '../api/articles';

interface ArticleCardProps {
    article: Article;
    onClick: (article: Article) => void;
    onToggleRead: (id: string, is_read: boolean) => void;
    onToggleFavorite: (id: string) => void;
}

const FALLBACK_IMAGE =
    'https://images.unsplash.com/photo-1586339949916-3e9457bef6d3?auto=format&fit=crop&q=80&w=800';

function plainExcerpt(html: string, max = 130): string {
    const text = html.replace(/<[^>]*>?/gm, '').trim();
    return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function ArticleCard({ article, onClick, onToggleRead, onToggleFavorite }: ArticleCardProps) {
    const [swipeOffset, setSwipeOffset] = useState(0);
    const [isSwiping, setIsSwiping] = useState(false);
    const [isSummarizing, setIsSummarizing] = useState(false);

    const handlers = useSwipeable({
        onSwiping: (event) => {
            if (Math.abs(event.deltaX) < 100) {
                setSwipeOffset(event.deltaX);
                setIsSwiping(true);
            }
        },
        onSwipedRight: () => {
            if (swipeOffset > 50) onToggleRead(article.id, !article.is_read);
            resetSwipe();
        },
        onSwipedLeft: () => {
            if (swipeOffset < -50) onToggleFavorite(article.id);
            resetSwipe();
        },
        onSwiped: () => resetSwipe(),
        trackMouse: true,
        preventScrollOnSwipe: false,
        delta: 50,
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
        } catch (error) {
            console.error('Failed to summarize:', error);
        } finally {
            setIsSummarizing(false);
        }
    };

    return (
        <div className="relative">
            {/* Swipe action hints behind the card */}
            <div className="absolute inset-0 flex items-center justify-between px-6 pointer-events-none">
                <span
                    className={`chip transition-opacity duration-300 ${swipeOffset > 10 ? 'opacity-100' : 'opacity-0'}`}
                >
                    {article.is_read ? 'Marquer non lu' : 'Marquer lu'}
                </span>
                <span
                    className={`chip bg-earth/15 text-earth transition-opacity duration-300 ${swipeOffset < -10 ? 'opacity-100' : 'opacity-0'}`}
                >
                    Favori
                </span>
            </div>

            <article
                {...handlers}
                onClick={() => !isSwiping && Math.abs(swipeOffset) < 5 && onClick(article)}
                className={`group relative z-10 cursor-pointer flex flex-col overflow-hidden rounded-2xl
                    bg-carbon-light border transition-colors
                    ${article.is_read ? 'border-paper-muted/10' : 'border-nature/20'}
                    hover:border-nature/40`}
                style={{
                    transform: `translateX(${swipeOffset}px)`,
                    transition: isSwiping ? 'none' : 'transform 0.45s cubic-bezier(0.22,1,0.36,1)',
                    boxShadow: 'var(--shadow-soft)',
                }}
            >
                {/* Cover */}
                <div className="aspect-[16/9] overflow-hidden relative bg-carbon-dark">
                    <div
                        className="w-full h-full bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                        style={{ backgroundImage: `url(${article.image_url || FALLBACK_IMAGE})` }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />

                    <span className="absolute bottom-3 left-3 chip bg-carbon-light/90 backdrop-blur-sm shadow-sm">
                        {article.feed_title || 'Journal'}
                    </span>

                    {!article.is_read && (
                        <div
                            className="absolute top-0 right-0 w-24 h-24 overflow-hidden pointer-events-none z-20"
                            aria-label="Article non lu"
                        >
                            <span className="absolute top-[18px] -right-[34px] w-[140px] rotate-45 bg-nature text-white text-[10px] font-extrabold uppercase tracking-[0.2em] text-center py-1.5 shadow-lg shadow-black/20 border-b border-white/10">
                                Nouveau
                            </span>
                        </div>
                    )}
                </div>

                {/* Body */}
                <div className="flex-1 flex flex-col gap-3 px-5 pt-4 pb-3">
                    <h2
                        className={`text-2xl font-serif leading-snug transition-colors group-hover:text-nature
                            ${article.is_read ? 'text-paper-muted font-normal' : 'text-paper-white font-bold'}`}
                    >
                        {article.title}
                    </h2>

                    {article.ai_summary ? (
                        <span className="chip self-start">✨ Résumé disponible</span>
                    ) : article.summary ? (
                        <p className="text-paper-muted text-sm leading-relaxed line-clamp-2 font-reading">
                            {plainExcerpt(article.summary)}
                        </p>
                    ) : null}

                    <div className="mt-auto flex items-center justify-between pt-3 border-t border-paper-muted/10">
                        <div className="flex items-center gap-1">
                            <button
                                onClick={(e) => { e.stopPropagation(); onToggleRead(article.id, !article.is_read); }}
                                className={`p-2 rounded-full border transition-all
                                    ${article.is_read
                                        ? 'text-nature/40 border-transparent hover:bg-nature/5'
                                        : 'text-nature border-nature/20 hover:bg-nature/10'}`}
                                title={article.is_read ? 'Marquer comme non lu' : 'Marquer comme lu'}
                                aria-label={article.is_read ? 'Marquer comme non lu' : 'Marquer comme lu'}
                            >
                                <svg className="w-4 h-4" fill={article.is_read ? 'none' : 'currentColor'} viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                                </svg>
                            </button>

                            <button
                                onClick={(e) => { e.stopPropagation(); onToggleFavorite(article.id); }}
                                className={`p-2 rounded-full transition-all ${article.is_favorite ? 'text-earth' : 'text-paper-muted hover:text-earth hover:bg-earth/10'}`}
                                title={article.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                                aria-label={article.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                                aria-pressed={article.is_favorite}
                            >
                                <svg className="w-4 h-4" fill={article.is_favorite ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                </svg>
                            </button>

                            <button
                                onClick={handleSummarize}
                                disabled={isSummarizing || !!article.ai_summary}
                                className={`p-2 rounded-full transition-all ${article.ai_summary ? 'text-nature opacity-40 cursor-default' : 'text-paper-muted hover:text-nature hover:bg-nature/10'}`}
                                title={article.ai_summary ? 'Résumé déjà généré' : 'Générer un résumé IA'}
                                aria-label={article.ai_summary ? 'Résumé déjà généré' : 'Générer un résumé IA'}
                            >
                                {isSummarizing ? (
                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                ) : (
                                    <span className="text-sm leading-none">✨</span>
                                )}
                            </button>
                        </div>

                        <time className="text-[11px] text-paper-muted/70 font-medium">
                            {new Date(article.published_at || article.created_at).toLocaleDateString('fr-FR', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                            })}
                        </time>
                    </div>
                </div>
            </article>
        </div>
    );
}
