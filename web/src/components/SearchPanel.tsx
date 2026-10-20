import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { articlesApi, type Article } from '../api/articles';
import { useUI } from '../stores/uiStore';
import { formatRelative } from '../lib/format';
import { FeedAvatar } from './FeedAvatar';
import { Icon } from './Icon';
import { summaryText } from '../lib/summary';

const RECENT_KEY = 'flowreader-recent-searches';

function loadRecent(): string[] {
    try {
        const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
        return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 5) : [];
    } catch {
        return [];
    }
}

function saveRecent(q: string) {
    try {
        const next = [q, ...loadRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 5);
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
        /* storage unavailable (private mode) */
    }
}

/** Wraps the first occurrence of `q` in <mark>. */
function Highlight({ text, q }: { text: string; q: string }) {
    const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
    if (i < 0) return <>{text}</>;
    return (
        <>
            {text.slice(0, i)}
            <mark className="bg-nature/20 text-paper-white rounded-[3px] px-px">{text.slice(i, i + q.length)}</mark>
            {text.slice(i + q.length)}
        </>
    );
}

/** A short excerpt centred on the match, so the hit is visible. */
function around(text: string, q: string) {
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return text.slice(0, 140);
    const start = Math.max(0, i - 50);
    const end = Math.min(text.length, i + q.length + 90);
    return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

/**
 * Full-text search over the user's articles. A centred palette on desktop
 * (⌘K, /), a full screen on phones.
 */
export function SearchPanel() {
    const setSearchOpen = useUI((s) => s.setSearchOpen);
    const setTab = useUI((s) => s.setTab);
    const [, setParams] = useSearchParams();
    const [input, setInput] = useState('');
    const [q, setQ] = useState('');
    const [recent, setRecent] = useState(loadRecent);
    const [active, setActive] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const close = () => setSearchOpen(false);

    // Debounce typing: one request per pause, not per keystroke.
    useEffect(() => {
        const t = window.setTimeout(() => {
            setQ(input.trim());
            setActive(0);
        }, 250);
        return () => window.clearTimeout(t);
    }, [input]);

    // Keyed under 'articles' so read / favorite updates are patched in.
    const { data: results, isFetching, isError } = useQuery({
        queryKey: ['articles', 'search', q],
        queryFn: () => articlesApi.search(q, 30),
        enabled: q.length >= 2,
        placeholderData: keepPreviousData,
        staleTime: 30 * 1000,
    });
    const hits = q.length >= 2 ? (results ?? []) : [];

    // Layout effect: its cleanup must run before a reader opened from a result
    // makes #root inert in turn.
    useLayoutEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        inputRef.current?.focus();
        const root = document.getElementById('root');
        root?.setAttribute('inert', '');
        return () => {
            root?.removeAttribute('inert');
            previous?.focus?.();
        };
    }, []);

    const open = (a: Article) => {
        if (q) {
            saveRecent(q);
            setRecent(loadRecent());
        }
        setTab('list');
        setParams(
            (p) => {
                const n = new URLSearchParams(p);
                n.set('a', a.id);
                return n;
            },
            { state: { reader: true } },
        );
        close();
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            close();
        } else if (e.key === 'ArrowDown' && hits.length) {
            e.preventDefault();
            setActive((i) => Math.min(hits.length - 1, i + 1));
        } else if (e.key === 'ArrowUp' && hits.length) {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
        } else if (e.key === 'Enter' && hits[active]) {
            e.preventDefault();
            open(hits[active]);
        }
    };

    useEffect(() => {
        listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [active]);

    // Portalled out of #root, which is made inert while the panel is open.
    return createPortal(
        <div
            className="fixed inset-0 z-[60] md:flex md:items-start md:justify-center md:p-6 md:pt-[12vh] md:bg-nature-dark/45 animate-fade-in"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) close();
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Recherche"
                onKeyDown={onKeyDown}
                className="h-full md:h-auto md:max-h-[70vh] w-full md:max-w-2xl flex flex-col bg-carbon-light md:rounded-2xl md:border md:border-line overflow-hidden md:shadow-[var(--shadow-float)] animate-rise"
            >
                <div className="shrink-0 flex items-center gap-1.5 pl-4 pr-2 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] border-b border-line bg-carbon md:bg-carbon-light">
                    <div role="search" className="relative flex-1 min-w-0 flex items-center">
                        <Icon name="search" size={18} strokeWidth={1.9} className="absolute left-3 text-paper-muted" />
                        <label htmlFor="search-q" className="sr-only">Rechercher dans vos articles</label>
                        <input
                            ref={inputRef}
                            id="search-q"
                            type="search"
                            enterKeyHint="search"
                            autoComplete="off"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Rechercher dans vos articles"
                            aria-controls="search-results"
                            aria-activedescendant={hits[active] ? `search-hit-${active}` : undefined}
                            className="w-full min-h-11 pl-10 pr-3 rounded-xl border-2 border-nature bg-carbon-light text-paper-white placeholder:text-paper-muted outline-none [&::-webkit-search-cancel-button]:cursor-pointer"
                        />
                    </div>
                    <button onClick={close} className="btn-ghost !px-3 !text-nature !text-[15px] md:hidden">Annuler</button>
                    <kbd className="kbd hidden md:inline-flex mx-1">Échap</kbd>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                    {q.length < 2 ? (
                        recent.length > 0 ? (
                            <div>
                                <h2 className="font-sans px-5 pt-4 pb-2 text-[13px] font-semibold text-paper-muted">Recherches récentes</h2>
                                <ul role="list">
                                    {recent.map((r) => (
                                        <li key={r}>
                                            <button
                                                onClick={() => setInput(r)}
                                                className="w-full flex items-center gap-3.5 min-h-12 px-5 border-b border-line text-left text-paper-white hover:bg-carbon"
                                            >
                                                <Icon name="clock" size={18} className="text-paper-muted" />
                                                {r}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <p className="px-6 py-10 text-center text-sm text-paper-muted">Cherchez un mot dans les titres et le texte de vos articles.</p>
                        )
                    ) : isError ? (
                        <p role="alert" className="px-6 py-10 text-center text-sm text-paper-muted">
                            {navigator.onLine ? 'La recherche a échoué. Réessayez.' : 'La recherche demande une connexion.'}
                        </p>
                    ) : hits.length === 0 ? (
                        <div className="px-8 py-12 text-center" role="status">
                            {isFetching ? (
                                <div className="mx-auto w-7 h-7 border-2 border-nature/20 border-t-nature rounded-full animate-spin" aria-label="Recherche en cours" />
                            ) : (
                                <>
                                    <p className="font-serif text-[22px] font-semibold text-paper-white">Aucun article trouvé</p>
                                    <p className="mt-1 text-sm text-paper-muted">Essayez un autre mot.</p>
                                </>
                            )}
                        </div>
                    ) : (
                        <>
                            <p className="px-5 pt-3.5 pb-1.5 text-[13px] font-semibold text-paper-muted" aria-live="polite">
                                {hits.length}
                                {hits.length >= 30 ? '+' : ''} résultat{hits.length > 1 ? 's' : ''}
                            </p>
                            <ul ref={listRef} id="search-results" role="listbox" aria-label="Résultats" className={isFetching ? 'opacity-70' : ''}>
                                {hits.map((a, i) => {
                                    const date = a.published_at || a.created_at;
                                    return (
                                        <li
                                            key={a.id}
                                            id={`search-hit-${i}`}
                                            data-i={i}
                                            role="option"
                                            aria-selected={i === active}
                                            onClick={() => open(a)}
                                            onMouseMove={() => setActive(i)}
                                            className={`flex flex-col gap-1 px-5 py-3 border-b border-line cursor-pointer ${i === active ? 'bg-select' : ''}`}
                                        >
                                            <span className="flex items-center gap-1.5 text-xs text-paper-muted">
                                                <FeedAvatar id={a.feed_id} title={a.feed_title} size={16} />
                                                <span className="font-semibold text-paper-white">{a.feed_title}</span>
                                                <span aria-hidden="true">·</span>
                                                <time dateTime={date}>{formatRelative(date)}</time>
                                            </span>
                                            <span className="font-serif text-[17px] leading-snug font-semibold text-paper-white">
                                                <Highlight text={a.title} q={q} />
                                            </span>
                                            {(a.excerpt || a.ai_summary) && (
                                                <span className="text-sm leading-relaxed text-paper-muted line-clamp-2">
                                                    <Highlight text={around(a.excerpt || summaryText(a.ai_summary || ''), q)} q={q} />
                                                </span>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
}
