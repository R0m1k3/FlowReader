import type { Article } from '../api/articles';
import { useSwipeable } from 'react-swipeable';

interface MobileReaderViewProps {
    article: Article;
    onClose: () => void;
    onToggleFavorite: (id: string) => void;
    onNext: () => void;
    onPrev: () => void;
}

export function MobileReaderView({ article, onClose, onToggleFavorite, onNext, onPrev }: MobileReaderViewProps) {
    // Determine content to show: full content > summary > default message
    let displayContent = article.content || article.summary || '<p class="italic text-paper-muted">Aucun contenu disponible pour cet article.</p>';

    // If we have a hero image, try to remove the first image from the content to avoid duplicates
    if (article.image_url) {
        displayContent = displayContent.replace(/<img[^>]*>/, '');
    }

    // Swipe handlers
    const handlers = useSwipeable({
        onSwipedLeft: () => onNext(),
        onSwipedRight: () => onPrev(),
        preventScrollOnSwipe: false,
        trackMouse: true // Allow testing with mouse in devtools
    });

    return (
        <div
            className="fixed inset-0 z-50 bg-carbon/95 backdrop-blur-md flex justify-center items-start overflow-y-auto animate-in fade-in duration-500"
            onClick={onClose}
        >
            <div
                {...handlers}
                className="w-full min-h-screen bg-carbon-light shadow-2xl relative animate-in slide-in-from-bottom duration-500 pb-20"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Mobile Header / Nav Indicator Hint */}
                <div className="absolute top-0 left-0 right-0 h-1 z-50 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-50"></div>

                {/* Hero Image Section */}
                {article.image_url && (
                    <div className="w-full h-[40vh] relative overflow-hidden">
                        <img
                            src={article.image_url}
                            alt={article.title}
                            className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-carbon-light via-carbon-light/20 to-transparent"></div>
                    </div>
                )}

                <div className={`px-6 ${!article.image_url ? 'pt-12' : 'pt-6'}`}>
                    <header className="mb-8">
                        <div className="flex items-center space-x-2 text-nature text-[10px] uppercase tracking-[0.3em] font-black mb-4">
                            <span className="bg-nature/10 px-2 py-1 rounded">{article.feed_title}</span>
                            <span className="opacity-30">•</span>
                            <span>{article.published_at ? new Date(article.published_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : 'Aujourd\'hui'}</span>
                        </div>

                        <h1 className="text-3xl font-serif text-paper-white leading-[1.2] italic-nature tracking-tight">
                            {article.title}
                        </h1>
                    </header>

                    <div
                        className="magazine-content text-paper-white/90 text-lg font-reading leading-relaxed space-y-6 selection:bg-nature/20 break-words overflow-x-hidden mb-12"
                        dangerouslySetInnerHTML={{ __html: displayContent }}
                    />

                    {/* Mobile Action Bar */}
                    <div className="flex items-center justify-between py-6 border-y border-white/5 mb-8">
                        <button
                            onClick={() => onToggleFavorite(article.id)}
                            className={`flex items-center space-x-3 px-4 py-2 rounded-full border transition-all duration-300 ${article.is_favorite
                                ? 'bg-nature text-white border-nature'
                                : 'border-paper-white/20 text-nature hover:bg-nature/5'
                                }`}
                        >
                            <svg className="w-5 h-5" fill={article.is_favorite ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                            </svg>
                            <span className="text-[10px] uppercase tracking-[0.2em] font-black">
                                {article.is_favorite ? 'Favori' : 'Favori'}
                            </span>
                        </button>

                        <a
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-3 bg-white/5 rounded-full text-paper-muted hover:text-white transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                        </a>
                    </div>

                    <footer className="text-center pb-24 opacity-60">
                        <p className="text-[10px] uppercase tracking-widest text-paper-muted animate-pulse">
                            Swipe pour lire la suite
                        </p>
                    </footer>
                </div>
            </div>

            {/* Fixed Close Button for Mobile - Top Right */}
            <div className="fixed top-6 right-6 z-50 pointer-events-none">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onClose();
                    }}
                    className="w-10 h-10 bg-nature text-carbon border border-white/10 rounded-full flex items-center justify-center active:scale-95 transition-all duration-300 pointer-events-auto hover:scale-110 shadow-lg"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
        </div>
    );
}
