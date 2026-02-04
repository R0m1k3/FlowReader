import type { Article } from '../api/articles';

interface ReaderViewProps {
    article: Article;
    onClose: () => void;
    onToggleFavorite: (id: string) => void;
}

export function ReaderView({ article, onClose, onToggleFavorite }: ReaderViewProps) {
    return (
        <div
            className="fixed inset-0 z-50 bg-carbon/95 backdrop-blur-sm flex justify-center overflow-y-auto animate-in fade-in duration-500"
            onClick={onClose}
        >
            <div
                className="w-full max-w-reading bg-carbon-light min-h-screen my-0 md:my-12 shadow-2xl relative animate-in slide-in-from-bottom duration-700"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Progress bar simulation */}
                <div className="sticky top-0 left-0 right-0 h-1 bg-gold/10 z-20">
                    <div className="h-full bg-gold w-1/3 gold-glow shadow-gold" />
                </div>

                <button
                    onClick={onClose}
                    className="absolute top-8 -right-16 hidden md:flex w-10 h-10 items-center justify-center rounded-full border border-gold/30 text-gold hover:bg-gold hover:text-carbon transition-all duration-300"
                >
                    ✕
                </button>

                <div className="p-8 md:p-16">
                    <header className="mb-12">
                        <div className="flex items-center space-x-3 text-gold text-xs uppercase tracking-[0.3em] font-bold mb-6">
                            <span>{article.feed_title}</span>
                            <span className="opacity-30">•</span>
                            <span>{article.published_at ? new Date(article.published_at).toLocaleDateString() : 'Aujourd\'hui'}</span>
                        </div>

                        <h1 className="text-4xl md:text-6xl font-serif text-paper-white leading-[1.1] mb-8 italic">
                            {article.title}
                        </h1>

                        <div className="flex items-center justify-between py-6 border-y border-carbon-dark/50">
                            <div className="flex items-center space-x-4">
                                <button
                                    onClick={() => onToggleFavorite(article.id)}
                                    className={`flex items-center space-x-2 px-4 py-2 rounded-full border transition-all ${article.is_favorite
                                            ? 'bg-gold text-carbon border-gold'
                                            : 'border-gold/30 text-gold hover:bg-gold/10'
                                        }`}
                                >
                                    <span>{article.is_favorite ? '★' : '☆'}</span>
                                    <span className="text-xs uppercase tracking-widest font-bold">
                                        {article.is_favorite ? 'Favori' : 'Ajouter'}
                                    </span>
                                </button>

                                <button className="p-2 text-paper-muted hover:text-gold transition-colors">
                                    📤
                                </button>
                            </div>

                            <a
                                href={article.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs uppercase tracking-widest font-bold text-gold hover:underline"
                            >
                                Lire sur le site original
                            </a>
                        </div>
                    </header>

                    <div
                        className="prose prose-invert prose-gold max-w-none text-paper-white/90 text-xl font-reading leading-magazine space-y-8"
                        dangerouslySetInnerHTML={{ __html: article.content || '<p>Aucun contenu disponible pour cet article.</p>' }}
                    />

                    <footer className="mt-20 pt-12 border-t border-carbon-dark/50 text-center pb-20">
                        <div className="text-gold text-3xl font-serif mb-4 italic italic-gold">F</div>
                        <p className="text-paper-muted text-sm font-sans tracking-wide">
                            FlowReader Magazine — Immersion Totale.
                        </p>
                    </footer>
                </div>
            </div>
        </div>
    );
}
