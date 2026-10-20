import { useEffect, useRef, useState } from 'react';
import type { Article } from '../api/articles';
import { Icon } from './Icon';

interface ShareButtonProps {
    article: Pick<Article, 'title' | 'url' | 'excerpt'>;
    className?: string;
    iconSize?: number;
    /** Open the fallback menu upwards (button in a bottom bar). */
    menuAbove?: boolean;
}

export function ShareButton({ article, className = 'icon-btn', iconSize = 18, menuAbove = false }: ShareButtonProps) {
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
                <Icon name="share" size={iconSize} />
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
                        className={`absolute w-52 surface-card z-50 py-1 text-sm animate-fade-in ${menuAbove ? 'left-0 bottom-14' : 'right-0 top-12'}`}
                    >
                        {items.map((it) => (
                            <button
                                key={it.label}
                                role="menuitem"
                                onClick={() => openLink(it.href)}
                                className="w-full text-left px-4 py-2.5 min-h-11 text-paper-white hover:bg-carbon-dark focus-visible:bg-carbon-dark"
                            >
                                {it.label}
                            </button>
                        ))}
                        <div className="border-t border-line my-1" />
                        <button
                            role="menuitem"
                            onClick={copyToClipboard}
                            className="w-full text-left px-4 py-2.5 min-h-11 text-paper-white hover:bg-carbon-dark focus-visible:bg-carbon-dark"
                        >
                            Copier le lien
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
