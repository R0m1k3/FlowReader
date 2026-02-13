import { ReaderViewProps } from './ReaderView'; // Self-reference import seems wrong, removing.
import { ShareButton } from './ShareButton';
// No need to import ReaderViewProps if we define it here, but let's keep clean.
import { type Article, articlesApi } from '../api/articles';

interface ReaderViewProps {
    article: Article;
    onClose: () => void;
    onToggleFavorite: (id: string) => void;
}

export function ReaderView({ article, onClose, onToggleFavorite }: ReaderViewProps) {
    const [aiSummary, setAiSummary] = useState(article.ai_summary);
    const [isSummarizing, setIsSummarizing] = useState(false);

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
            className="fixed inset-0 z-50 bg-carbon/95 backdrop-blur-md flex justify-center items-start overflow-y-auto animate-in fade-in duration-500"
            onClick={onClose}
        >
            <div
                className="w-full max-w-4xl bg-carbon-light h-fit min-h-[50vh] my-12 shadow-[0_0_100px_rgba(0,0,0,0.8)] relative animate-in slide-in-from-bottom duration-700 rounded-3xl border border-white/5"
                onClick={(e) => e.stopPropagation()}
            >


                {/* Close button for desktop */}
                <button
                    onClick={onClose}
                    className="absolute top-8 -right-16 hidden md:flex w-12 h-12 items-center justify-center rounded-full border border-nature/20 text-nature hover:bg-nature hover:text-white hover:scale-110 transition-all duration-300 z-50"
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
                    <header className="mb-10">
                        <div className="flex items-center space-x-3 text-nature text-[10px] uppercase tracking-[0.4em] font-black mb-8">
                            <span className="bg-nature/10 px-2 py-1 rounded">{article.feed_title}</span>
                            <span className="opacity-30">•</span>
                            <span>{article.published_at ? new Date(article.published_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Aujourd\'hui'}</span>
                        </div>

                        <h1 className="text-4xl md:text-6xl font-serif text-paper-white leading-[1.15] italic-nature tracking-tight mb-8">
                            {article.title}
                        </h1>

                        {/* Smart Digest Section */}
                        {aiSummary ? (
                            <div className="bg-nature/5 border-l-4 border-nature p-6 rounded-r-2xl mb-12 animate-fade-in shadow-sm">
                                <h3 className="text-nature font-black text-[10px] uppercase tracking-[0.2em] mb-4 flex items-center">
                                    <span className="mr-2 text-base">✨</span> Résumé
                                </h3>
                                <p className="text-paper-white text-lg leading-relaxed font-reading italic">
                                    {aiSummary}
                                </p>
                            </div>
                        ) : (
                            <div className="mb-12">
                                <button
                                    onClick={async (e) => {
                                        e.stopPropagation();
                                        setIsSummarizing(true);
                                        try {
                                            const res = await articlesApi.summarize(article.id);
                                            setAiSummary(res.summary);
                                        } catch (err) {
                                            console.error("Failed to summarize:", err);
                                        } finally {
                                            setIsSummarizing(false);
                                        }
                                    }}
                                    disabled={isSummarizing}
                                    className={`group flex items-center space-x-3 bg-nature/5 hover:bg-nature text-nature hover:text-white border border-nature/20 px-6 py-3 rounded-full transition-all duration-500 ${isSummarizing ? 'opacity-50 cursor-wait' : ''}`}
                                >
                                    <span className={`text-xl transition-transform ${isSummarizing ? 'animate-spin' : 'group-hover:rotate-12'}`}>
                                        {isSummarizing ? '⏳' : '✨'}
                                    </span>
                                    <span className="text-[10px] uppercase tracking-[0.2em] font-black">
                                        {isSummarizing ? 'Génération en cours...' : 'Générer le résumé'}
                                    </span>
                                </button>
                            </div>
                        )}
                    </header>

                    <div
                        className="magazine-content text-paper-white/90 text-xl font-reading leading-relaxed space-y-8 selection:bg-nature/20 break-words overflow-x-hidden mb-12"
                        dangerouslySetInnerHTML={{ __html: displayContent }}
                    />

                    <div className="flex items-center justify-between py-8 border-y border-white/5 mb-16">
                        <div className="flex items-center space-x-6">
                            <ShareButton article={article} />
                            <button
                                onClick={() => onToggleFavorite(article.id)}
                                className={`flex items-center space-x-3 px-6 py-2.5 rounded-full border transition-all duration-500 ${article.is_favorite
                                    ? 'bg-nature text-white border-paper-white/20 shadow-lg'
                                    : 'border-paper-white/20 text-nature hover:bg-nature/5'
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
                            className="group flex items-center space-x-2 text-[10px] uppercase tracking-[0.2em] font-black text-paper-muted hover:text-nature transition-colors"
                        >
                            <span>Source d'origine</span>
                            <svg className="w-3 h-3 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                        </a>
                    </div>

                    <footer className="text-center pb-24">
                        <div className="text-nature text-4xl font-serif mb-6 italic select-none">F.</div>
                        <p className="text-paper-muted/40 text-[10px] uppercase tracking-[0.4em] font-black">
                            FlowReader Lux Édition • 2026
                        </p>
                    </footer>
                </div>
            </div>

            {/* Mobile close button overlay */}
            <button
                onClick={onClose}
                className="fixed bottom-8 right-8 md:hidden w-14 h-14 bg-nature text-white rounded-full shadow-2xl flex items-center justify-center scale-90 active:scale-75 transition-transform nature-glow z-50"
            >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
}
