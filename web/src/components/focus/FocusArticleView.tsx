import { motion } from 'framer-motion';
import type { Article } from '../../api/articles';

interface FocusArticleViewProps {
    article: Article;
    onClose: () => void;
    onNext: (action: 'read' | 'keep') => void;
}

export function FocusArticleView({ article, onClose, onNext }: FocusArticleViewProps) {
    // Format content for readability
    const formattedDate = new Date(article.published_at || article.created_at).toLocaleDateString('fr-FR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-paper-white/90 backdrop-blur-xl"
        >
            <div className="w-full max-w-3xl h-full bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col relative border border-gray-100">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-50 w-10 h-10 flex items-center justify-center rounded-full bg-white/80 backdrop-blur hover:bg-white text-paper-white shadow-sm transition-all hover:scale-110"
                >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                {/* Content Scroll View */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {/* Hero Image */}
                    {article.image_url && (
                        <div className="h-64 sm:h-80 w-full relative">
                            <div
                                className="w-full h-full bg-cover bg-center"
                                style={{ backgroundImage: `url(${article.image_url})` }}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-black/30" />
                        </div>
                    )}

                    <div className="px-8 py-10 sm:px-12 max-w-2xl mx-auto">
                        {/* Header */}
                        <header className="mb-8 text-center">
                            <div className="flex items-center justify-center space-x-2 text-nature mb-4 uppercase tracking-widest text-xs font-bold">
                                <span>{article.feed_title}</span>
                                <span>•</span>
                                <span>{formattedDate}</span>
                            </div>
                            <h1 className="text-3xl sm:text-4xl font-serif font-bold text-paper-white leading-tight mb-6">
                                {article.title}
                            </h1>
                            <div className="w-16 h-1 bg-nature/20 mx-auto rounded-full" />
                        </header>

                        {/* Article Body */}
                        <article className="prose prose-lg prose-stone prose-headings:font-serif prose-headings:font-bold prose-p:font-reading prose-p:leading-loose mx-auto">
                            {article.content ? (
                                <div dangerouslySetInnerHTML={{ __html: article.content }} />
                            ) : (
                                <p className="text-paper-muted italic text-center">
                                    {article.summary || "Contenu non disponible."}
                                </p>
                            )}
                        </article>

                        {/* Actions Footer - In Flow */}
                        <div className="mt-16 pt-8 border-t border-gray-100 flex flex-col sm:flex-row gap-4 justify-center">
                            <button
                                onClick={() => onNext('keep')}
                                className="px-8 py-4 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 font-bold hover:bg-blue-100 transition-colors flex items-center justify-center gap-2 group"
                            >
                                <span className="transform group-hover:scale-110 transition-transform">⭐</span>
                                Garder pour plus tard
                            </button>
                            <button
                                onClick={() => onNext('read')}
                                className="px-8 py-4 rounded-xl bg-nature text-white font-bold shadow-lg shadow-nature/20 hover:bg-nature-light hover:shadow-xl hover:-translate-y-1 transition-all flex items-center justify-center gap-2 group"
                            >
                                <svg className="w-5 h-5 transform group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                J'ai fini cet article
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
