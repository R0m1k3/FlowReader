import type { Article } from '../api/articles';

interface ReaderViewProps {
    article: Article;
    onClose: () => void;
    onToggleFavorite: (id: string) => void;
}

export function ReaderView({ article, onClose, onToggleFavorite }: ReaderViewProps) {
    // Determine content to show: full content > summary > default message
    let displayContent = article.content || article.summary || '<p class="italic text-paper-muted">Aucun contenu disponible pour cet article.</p>';

    // If we have a hero image, try to remove the first image from the content to avoid duplicates
    if (article.image_url) {
        // Simple regex to remove the first img tag if it exists at the start of the content
        // This is a heuristic and might need refinement, but handles the "duplicate" complaint common in RSS
        displayContent = displayContent.replace(/<img[^>]*>/, '');
    }

    return (
        <div
            className="fixed inset-0 z-50 bg-carbon/95 backdrop-blur-md flex justify-center overflow-y-auto animate-in fade-in duration-500"
            onClick={onClose}
        >
            <div
                className="w-full max-w-4xl bg-carbon-light min-h-screen my-0 md:my-12 shadow-[0_0_100px_rgba(0,0,0,0.8)] relative animate-in slide-in-from-bottom duration-700 rounded-t-3xl md:rounded-3xl border border-white/5"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Progress bar simulation */}
                <div className="sticky top-0 left-0 right-0 h-1 bg-gold/5 z-30">
                    <div className="h-full bg-gold w-1/4 gold-glow shadow-gold" />
                </div>

                {/* Close button for desktop */}
                <button
                    onClick={onClose}
                    className="absolute top-8 -right-16 hidden md:flex w-12 h-12 items-center justify-center rounded-full border border-gold/20 text-gold hover:bg-gold hover:text-carbon hover:scale-110 transition-all duration-300 z-50"
                    title="Fermer"
                >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                {/* Hero Image Section */}
                {article.image_url && (
                    <div className="w-full h-[40vh] md:h-[50vh] relative overflow-hidden rounded-t-3xl md:rounded-t-[calc(1.5rem-1px)]">
                        <img
                            src={article.image_url}
                            alt={article.title}
                            className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-carbon-light via-carbon-light/20 to-transparent"></div>
                    </div>
                )}

                <div className={`p-8 md:p-20 ${!article.image_url ? 'pt-16' : 'pt-8'}`}>
                    <header className="mb-16">
                        <div className="flex items-center space-x-3 text-gold text-[10px] uppercase tracking-[0.4em] font-black mb-8">
                            <span className="bg-gold/10 px-2 py-1 rounded">{article.feed_title}</span>
                            <span className="opacity-30">•</span>
                            <span>{article.published_at ? new Date(article.published_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Aujourd\'hui'}</span>
                        </div>

                        <h1 className="text-4xl md:text-6xl font-serif text-paper-white leading-[1.15] mb-10 italic-gold tracking-tight">
                            {article.title}
                        </h1>

                        <div className="flex items-center justify-between py-8 border-y border-white/5">
                            <div className="flex items-center space-x-6">
                                <button
                                    onClick={() => onToggleFavorite(article.id)}
                                    className={`flex items-center space-x-3 px-6 py-2.5 rounded-full border transition-all duration-500 ${article.is_favorite
                                        ? 'bg-gold text-carbon border-gold gold-glow'
                                        : 'border-gold/20 text-gold hover:bg-gold/5'
                                        }`}
                                >
                                    <svg className="w-4 h-4" fill={article.is_favorite ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                    </svg>
                                    <span className="text-[10px] uppercase tracking-[0.2em] font-black">
                                        {article.is_favorite ? 'Dans vos favoris' : 'Ajouter aux favoris'}
                                    </span>
                                </button>
                            </div>

                            <a
                                href={article.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group flex items-center space-x-2 text-[10px] uppercase tracking-[0.2em] font-black text-paper-muted hover:text-gold transition-colors"
                            >
                                <span>Source d'origine</span>
                                <svg className="w-3 h-3 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                </svg>
                            </a>
                        </div>
                    </header>

                    <div
                        className="magazine-content text-paper-white/90 text-xl font-reading leading-relaxed space-y-8 selection:bg-gold/20 break-words overflow-x-hidden"
                        dangerouslySetInnerHTML={{ __html: displayContent }}
                    />

                    <footer className="mt-32 pt-16 border-t border-white/5 text-center pb-24">
                        <div className="text-gold text-4xl font-serif mb-6 italic select-none">F.</div>
                        <p className="text-paper-muted/40 text-[10px] uppercase tracking-[0.4em] font-black">
                            FlowReader Lux Édition • 2026
                        </p>
                    </footer>
                </div>
            </div>

            {/* Mobile close button overlay */}
            <button
                onClick={onClose}
                className="fixed bottom-8 right-8 md:hidden w-14 h-14 bg-gold text-carbon rounded-full shadow-2xl flex items-center justify-center scale-90 active:scale-75 transition-transform gold-glow z-50"
            >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
}
