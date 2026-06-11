import { useState } from 'react';
import { useSwipeable } from 'react-swipeable';
import { motion } from 'framer-motion';
import { ShareButton } from './ShareButton';
import { type Article, articlesApi } from '../api/articles';

interface MobileReaderViewProps {
    article: Article;
    onClose: () => void;
    onToggleFavorite: (id: string) => void;
    onNext: () => void;
    onPrev: () => void;
}

export function MobileReaderView({ article, onClose, onToggleFavorite, onNext, onPrev }: MobileReaderViewProps) {
    const [aiSummary, setAiSummary] = useState(article.ai_summary);
    const [isSummarizing, setIsSummarizing] = useState(false);

    let displayContent =
        article.content || article.summary || '<p class="italic text-paper-muted">Aucun contenu disponible pour cet article.</p>';
    if (article.image_url) displayContent = displayContent.replace(/<img[^>]*>/, '');

    const handlers = useSwipeable({
        onSwipedLeft: () => onNext(),
        onSwipedRight: () => onPrev(),
        preventScrollOnSwipe: false,
        trackMouse: true,
    });

    const handleSummarize = async () => {
        setIsSummarizing(true);
        try {
            const res = await articlesApi.summarize(article.id);
            setAiSummary(res.summary);
        } catch (err) {
            console.error('Failed to summarize:', err);
        } finally {
            setIsSummarizing(false);
        }
    };

    return (
        <motion.div
            className="fixed inset-0 z-50 bg-carbon flex justify-center items-start overflow-y-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label={article.title}
        >
            <motion.div
                {...handlers}
                className="w-full min-h-screen bg-carbon-light relative pb-24"
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 30, opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                onClick={(e) => e.stopPropagation()}
            >
                {article.image_url && (
                    <div className="w-full h-[38vh] relative overflow-hidden">
                        <img src={article.image_url} alt="" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-carbon-light via-carbon-light/20 to-transparent" />
                    </div>
                )}

                <div className={`px-6 ${article.image_url ? 'pt-6' : 'pt-14'}`}>
                    <header className="mb-8">
                        <div className="flex flex-wrap items-center gap-2 mb-4">
                            <span className="chip">{article.feed_title}</span>
                            <span className="text-paper-muted/40">·</span>
                            <span className="text-paper-muted text-xs">
                                {article.published_at
                                    ? new Date(article.published_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
                                    : "Aujourd'hui"}
                            </span>
                        </div>
                        <h1 className="text-3xl font-serif text-paper-white leading-tight tracking-tight text-balance">
                            {article.title}
                        </h1>

                        {aiSummary ? (
                            <div className="mt-6 bg-nature/5 border-l-4 border-nature p-4 rounded-r-2xl">
                                <h2 className="eyebrow mb-2 flex items-center gap-2"><span>✨</span> Résumé IA</h2>
                                <p className="text-paper-white/90 leading-relaxed font-reading italic">{aiSummary}</p>
                            </div>
                        ) : (
                            <button onClick={handleSummarize} disabled={isSummarizing} className="btn-secondary mt-6">
                                <span className={isSummarizing ? 'animate-spin' : ''}>{isSummarizing ? '⏳' : '✨'}</span>
                                {isSummarizing ? 'Génération…' : 'Générer le résumé'}
                            </button>
                        )}
                    </header>

                    <div
                        className="magazine-content text-lg break-words mb-12"
                        dangerouslySetInnerHTML={{ __html: displayContent }}
                    />

                    <div className="flex items-center justify-between py-5 border-y border-paper-muted/12 mb-8">
                        <ShareButton article={article} />
                        <button
                            onClick={() => onToggleFavorite(article.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full border text-[11px] uppercase tracking-[0.18em] font-bold transition-all ${
                                article.is_favorite ? 'bg-earth text-white border-earth' : 'border-earth/30 text-earth'
                            }`}
                            aria-pressed={article.is_favorite}
                        >
                            <svg className="w-4 h-4" fill={article.is_favorite ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                            </svg>
                            {article.is_favorite ? 'Favori' : 'Ajouter'}
                        </button>
                        {article.url && (
                            <a href={article.url} target="_blank" rel="noopener noreferrer" className="icon-btn" aria-label="Source d'origine">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                </svg>
                            </a>
                        )}
                    </div>

                    <footer className="text-center pb-10 opacity-60">
                        <p className="eyebrow text-paper-muted animate-pulse">Glissez pour lire la suite</p>
                    </footer>
                </div>
            </motion.div>

            <button
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                className="fixed top-5 right-5 z-50 w-10 h-10 bg-nature text-white rounded-full flex items-center justify-center active:scale-95 shadow-lg"
                aria-label="Fermer"
            >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </motion.div>
    );
}
