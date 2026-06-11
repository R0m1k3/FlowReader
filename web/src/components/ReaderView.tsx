import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ShareButton } from './ShareButton';
import { type Article, articlesApi } from '../api/articles';

interface ReaderViewProps {
    article: Article;
    onClose: () => void;
    onToggleFavorite: (id: string) => void;
}

export function ReaderView({ article, onClose, onToggleFavorite }: ReaderViewProps) {
    const [aiSummary, setAiSummary] = useState(article.ai_summary);
    const [isSummarizing, setIsSummarizing] = useState(false);

    let displayContent =
        article.content || article.summary || '<p class="italic text-paper-muted">Aucun contenu disponible pour cet article.</p>';
    if (article.image_url) displayContent = displayContent.replace(/<img[^>]*>/, '');

    // Close on Escape
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const handleSummarize = async (e: React.MouseEvent) => {
        e.stopPropagation();
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
            className="fixed inset-0 z-50 bg-carbon/90 backdrop-blur-md flex justify-center items-start overflow-y-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label={article.title}
        >
            <motion.article
                className="w-full max-w-3xl bg-carbon-light h-fit min-h-[60vh] my-0 md:my-12 relative md:rounded-3xl border border-paper-muted/12 overflow-hidden"
                style={{ boxShadow: 'var(--shadow-float)' }}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Desktop close */}
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 z-50 hidden md:flex w-11 h-11 items-center justify-center rounded-full bg-carbon-light/80 backdrop-blur border border-nature/20 text-nature hover:bg-nature hover:text-white transition-all"
                    title="Fermer"
                    aria-label="Fermer"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                {/* Hero */}
                {article.image_url && (
                    <div className="w-full h-[38vh] md:h-[44vh] relative overflow-hidden">
                        <img src={article.image_url} alt="" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-carbon-light via-carbon-light/20 to-transparent" />
                    </div>
                )}

                <div className={`px-6 md:px-16 ${article.image_url ? 'pt-8' : 'pt-16'} pb-16`}>
                    <header className="mb-10">
                        <div className="flex flex-wrap items-center gap-3 mb-6">
                            <span className="chip">{article.feed_title}</span>
                            <span className="text-paper-muted/40">·</span>
                            <span className="text-paper-muted text-xs font-medium">
                                {article.published_at
                                    ? new Date(article.published_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
                                    : "Aujourd'hui"}
                            </span>
                        </div>

                        <h1 className="text-4xl md:text-5xl font-serif text-paper-white leading-[1.12] tracking-tight mb-8 text-balance">
                            {article.title}
                        </h1>

                        {/* Smart Digest */}
                        {aiSummary ? (
                            <div className="bg-nature/5 border-l-4 border-nature p-6 rounded-r-2xl">
                                <h2 className="eyebrow mb-3 flex items-center gap-2"><span>✨</span> Résumé IA</h2>
                                <p className="text-paper-white/90 text-lg leading-relaxed font-reading italic">{aiSummary}</p>
                            </div>
                        ) : (
                            <button onClick={handleSummarize} disabled={isSummarizing} className="btn-secondary">
                                <span className={isSummarizing ? 'animate-spin' : ''}>{isSummarizing ? '⏳' : '✨'}</span>
                                {isSummarizing ? 'Génération…' : 'Générer le résumé'}
                            </button>
                        )}
                    </header>

                    <div
                        className="magazine-content drop-cap max-w-2xl mx-auto text-lg md:text-xl break-words mb-12"
                        dangerouslySetInnerHTML={{ __html: displayContent }}
                    />

                    <div className="flex items-center justify-between py-6 border-y border-paper-muted/12">
                        <div className="flex items-center gap-3">
                            <ShareButton article={article} />
                            <button
                                onClick={() => onToggleFavorite(article.id)}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-full border text-[11px] uppercase tracking-[0.18em] font-bold transition-all ${
                                    article.is_favorite ? 'bg-earth text-white border-earth' : 'border-earth/30 text-earth hover:bg-earth/10'
                                }`}
                                aria-pressed={article.is_favorite}
                            >
                                <svg className="w-4 h-4" fill={article.is_favorite ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                </svg>
                                {article.is_favorite ? 'Favori' : 'Ajouter'}
                            </button>
                        </div>

                        {article.url && (
                            <a href={article.url} target="_blank" rel="noopener noreferrer"
                                className="group flex items-center gap-2 eyebrow text-paper-muted hover:text-nature transition-colors">
                                Source
                                <svg className="w-3 h-3 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                </svg>
                            </a>
                        )}
                    </div>

                    <footer className="text-center pt-12">
                        <div className="text-nature text-3xl font-serif italic select-none mb-3">F.</div>
                        <p className="eyebrow text-paper-muted/40">FlowReader · Édition 2026</p>
                    </footer>
                </div>
            </motion.article>

            {/* Mobile close */}
            <button
                onClick={onClose}
                className="fixed bottom-8 right-8 md:hidden w-14 h-14 bg-nature text-white rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-transform z-50"
                aria-label="Fermer"
            >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </motion.div>
    );
}
