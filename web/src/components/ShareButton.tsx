import { useState } from 'react';
import type { Article } from '../api/articles';

interface ShareButtonProps {
    article: Article;
    className?: string;
}

export function ShareButton({ article, className = "" }: ShareButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    const shareData = {
        title: article.title || 'Article FlowReader',
        text: article.summary ? article.summary.substring(0, 100) + '...' : (article.title || ''),
        url: article.url || window.location.href,
    };

    const handleShare = async () => {
        // Try Native Share API first (Mobile & Supported Browsers)
        if (navigator.share) {
            try {
                await navigator.share(shareData);
                return;
            } catch (err) {
                console.log('Error sharing:', err);
                // If user cancelled, do nothing. If error, maybe fallback?
                // Usually if navigator.share exists, we trust it unless it throws.
                // But on some desktops it might exist but fail.
            }
        }

        // Fallback to custom menu
        setIsOpen(!isOpen);
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(article.url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        setIsOpen(false);
    };

    const openLink = (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
        setIsOpen(false);
    };

    return (
        <div className="relative">
            <button
                onClick={handleShare}
                className={`p-2 rounded-full transition-all duration-300 hover:bg-nature/10 text-nature ${className}`}
                title="Partager"
            >
                <svg className="w-5 h-5 space-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
            </button>

            {/* Desktop Fallback Menu */}
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
                    <div className="absolute right-0 bottom-12 mt-2 w-48 bg-white dark:bg-carbon border border-gray-200 dark:border-white/10 rounded-xl shadow-xl z-50 overflow-hidden text-sm animate-in fade-in zoom-in-95 duration-200 origin-bottom-right">
                        <div className="py-1">
                            <button
                                onClick={() => openLink(`https://wa.me/?text=${encodeURIComponent((article.title || '') + ' ' + (article.url || ''))}`)}
                                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-white/5 flex items-center gap-3 text-gray-700 dark:text-gray-200"
                            >
                                <span className="text-green-500">
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" /></svg>
                                </span>
                                WhatsApp
                            </button>
                            <button
                                onClick={() => openLink(`mailto:?subject=${encodeURIComponent(article.title || '')}&body=${encodeURIComponent(article.url || '')}`)}
                                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-white/5 flex items-center gap-3 text-gray-700 dark:text-gray-200"
                            >
                                <span className="text-gray-500">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                </span>
                                Email
                            </button>
                            <button
                                onClick={() => openLink(`https://twitter.com/intent/tweet?text=${encodeURIComponent(article.title || '')}&url=${encodeURIComponent(article.url || '')}`)}
                                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-white/5 flex items-center gap-3 text-gray-700 dark:text-gray-200"
                            >
                                <span className="text-blue-400">
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                                </span>
                                X / Twitter
                            </button>
                            <button
                                onClick={() => openLink(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(article.url || '')}`)}
                                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-white/5 flex items-center gap-3 text-gray-700 dark:text-gray-200"
                            >
                                <span className="text-blue-700">
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" /></svg>
                                </span>
                                LinkedIn
                            </button>
                            <div className="border-t border-gray-200 dark:border-white/10 my-1"></div>
                            <button
                                onClick={copyToClipboard}
                                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-white/5 flex items-center gap-3 text-gray-700 dark:text-gray-200"
                            >
                                <span className="text-gray-400">
                                    {copied ? (
                                        <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    ) : (
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                    )}
                                </span>
                                {copied ? 'Copié !' : 'Copier le lien'}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
