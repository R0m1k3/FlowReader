import { useEffect, useRef, useState } from 'react';
import type { Article } from '../api/articles';

interface ShareButtonProps {
    article: Pick<Article, 'title' | 'url' | 'excerpt'>;
    className?: string;
}

export function ShareButton({ article, className = 'icon-btn' }: ShareButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const url = article.url || window.location.href;

    // Escape closes only the menu, not the reader behind it.
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopImmediatePropagation();
                setIsOpen(false);
            }
        };
        window.addEventListener('keydown', onKey, true);
        menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
        return () => window.removeEventListener('keydown', onKey, true);
    }, [isOpen]);

    const handleShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({ title: article.title, text: article.excerpt?.slice(0, 120), url });
                return;
            } catch (err) {
                if ((err as DOMException)?.name === 'AbortError') return;
            }
        }
        setIsOpen((o) => !o);
    };

    const copyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } finally {
            setIsOpen(false);
        }
    };

    const openLink = (href: string) => {
        window.open(href, '_blank', 'noopener,noreferrer');
        setIsOpen(false);
    };

    const enc = encodeURIComponent;
    const items = [
        { label: 'E-mail', href: `mailto:?subject=${enc(article.title)}&body=${enc(url)}` },
        { label: 'WhatsApp', href: `https://wa.me/?text=${enc(`${article.title} ${url}`)}` },
        { label: 'X / Twitter', href: `https://twitter.com/intent/tweet?text=${enc(article.title)}&url=${enc(url)}` },
        { label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}` },
    ];

    return (
        <div className="relative">
            <button
                onClick={handleShare}
                className={className}
                title="Partager"
                aria-label="Partager"
                aria-haspopup="menu"
                aria-expanded={isOpen}
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
            </button>
            {copied && (
                <span role="status" className="absolute -top-9 left-1/2 -translate-x-1/2 chip whitespace-nowrap">Lien copié</span>
            )}

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div
                        ref={menuRef}
                        role="menu"
                        className="absolute right-0 top-12 w-52 surface-card z-50 py-1 text-sm animate-fade-in"
                    >
                        {items.map((it) => (
                            <button
                                key={it.label}
                                role="menuitem"
                                onClick={() => openLink(it.href)}
                                className="w-full text-left px-4 py-2.5 min-h-11 text-paper-white hover:bg-nature/10 focus-visible:bg-nature/10"
                            >
                                {it.label}
                            </button>
                        ))}
                        <div className="border-t border-paper-muted/15 my-1" />
                        <button
                            role="menuitem"
                            onClick={copyToClipboard}
                            className="w-full text-left px-4 py-2.5 min-h-11 text-paper-white hover:bg-nature/10 focus-visible:bg-nature/10"
                        >
                            Copier le lien
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
