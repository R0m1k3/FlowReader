import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { feedsApi } from '../api/feeds';
import { authApi } from '../api/auth';
import { useAuthStore, clearUserData } from '../stores/authStore';
import { usePrefs } from '../stores/prefsStore';
import { useIsMobile } from '../hooks/useIsMobile';
import { AddFeedModal } from './AddFeedModal';
import { ManageFeedsModal } from './ManageFeedsModal';
import { ShortcutsHelp } from './ShortcutsHelp';

interface TopBarProps {
    onSelectFeed: (feedId: string | null) => void;
    selectedFeedId: string | null;
    onEnterFocus: () => void;
}

interface ScopeItem {
    id: string | null;
    label: string;
    unread: number;
    error?: boolean;
}

/** Closes a popover on outside pointer down or Escape, returning focus to its trigger. */
function useDismiss(open: boolean, close: () => void, refs: React.RefObject<HTMLElement | null>[]) {
    useEffect(() => {
        if (!open) return;
        const onDown = (e: PointerEvent) => {
            if (!refs.some((r) => r.current?.contains(e.target as Node))) close();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                close();
            }
        };
        document.addEventListener('pointerdown', onDown);
        window.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onDown);
            window.removeEventListener('keydown', onKey);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, close]);
}

/** Arrow-key navigation between the menu's items. */
function onMenuKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemradio"],[role="menuitem"]'));
    if (items.length === 0) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next =
        e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next].focus();
    e.preventDefault();
}

const Check = () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
    </svg>
);

/**
 * Navigation bar. The page title is the feed selector: one place says what
 * you are looking at and lets you change it.
 */
export function TopBar({ onSelectFeed, selectedFeedId, onEnterFocus }: TopBarProps) {
    const qc = useQueryClient();
    const isMobile = useIsMobile();
    const [scopeOpen, setScopeOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [addOpen, setAddOpen] = useState(false);
    const [manageOpen, setManageOpen] = useState(false);
    const [helpOpen, setHelpOpen] = useState(false);

    const scopeBtn = useRef<HTMLButtonElement>(null);
    const scopePanel = useRef<HTMLDivElement>(null);
    const menuBtn = useRef<HTMLButtonElement>(null);
    const menuPanel = useRef<HTMLDivElement>(null);

    const user = useAuthStore((s) => s.user);
    const logoutStore = useAuthStore((s) => s.logout);
    const theme = usePrefs((s) => s.theme);
    const setTheme = usePrefs((s) => s.setTheme);
    const { data: feeds } = useQuery({ queryKey: ['feeds'], queryFn: () => feedsApi.list() });

    const logout = useMutation({
        mutationFn: () => authApi.logout(),
        onSettled: async () => {
            logoutStore();
            qc.clear();
            await clearUserData();
            window.location.href = '/login';
        },
    });

    const closeScope = () => {
        setScopeOpen(false);
        scopeBtn.current?.focus();
    };
    const closeMenu = () => {
        setMenuOpen(false);
        menuBtn.current?.focus();
    };
    useDismiss(scopeOpen, closeScope, [scopeBtn, scopePanel]);
    useDismiss(menuOpen, closeMenu, [menuBtn, menuPanel]);

    // Focus the selected entry when the feed menu opens.
    useEffect(() => {
        if (!scopeOpen) return;
        const el = scopePanel.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? scopePanel.current?.querySelector<HTMLElement>('[role="menuitemradio"]');
        el?.focus();
    }, [scopeOpen]);
    useEffect(() => {
        if (menuOpen) menuPanel.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }, [menuOpen]);

    const totalUnread = (feeds ?? []).reduce((n, f) => n + (f.unread_count ?? 0), 0);
    const main: ScopeItem[] = [
        { id: null, label: 'Tous les articles', unread: totalUnread },
        { id: 'favorites', label: 'Favoris', unread: 0 },
    ];
    const feedItems: ScopeItem[] = (feeds ?? []).map((f) => ({
        id: f.id,
        label: f.title,
        unread: f.unread_count ?? 0,
        error: !!f.fetch_error,
    }));
    const current = [...main, ...feedItems].find((i) => i.id === selectedFeedId) ?? main[0];
    const isDark = theme === 'dark' || (theme === 'system' && document.documentElement.classList.contains('dark'));

    const choose = (id: string | null) => {
        onSelectFeed(id);
        setScopeOpen(false);
        scopeBtn.current?.focus();
    };

    const renderItem = (item: ScopeItem) => {
        const active = item.id === selectedFeedId;
        return (
            <button
                key={item.id ?? 'all'}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => choose(item.id)}
                className={`w-full flex items-center gap-3 px-4 min-h-11 text-left rounded-lg transition-colors outline-none
                    focus-visible:bg-nature/10 hover:bg-nature/8 ${active ? 'text-nature font-semibold' : 'text-paper-white'}`}
            >
                <span className="w-4 shrink-0 text-nature">{active && <Check />}</span>
                <span className="flex-1 min-w-0 truncate">{item.label}</span>
                {item.error && (
                    <span className="text-xs text-danger shrink-0" title="Ce flux ne se met plus à jour">
                        erreur
                    </span>
                )}
                {item.unread > 0 && <span className="text-sm tabular-nums text-paper-muted shrink-0">{item.unread}</span>}
            </button>
        );
    };

    const scopeList = (
        <div
            ref={scopePanel}
            role="menu"
            aria-label="Choisir les articles affichés"
            onKeyDown={onMenuKeyDown}
            className={
                isMobile
                    ? 'fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] overflow-y-auto rounded-t-3xl bg-carbon-light p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.35)] animate-rise'
                    : 'absolute left-0 top-full mt-2 z-50 w-80 max-h-[70vh] overflow-y-auto surface-card p-2 animate-fade-in'
            }
        >
            {isMobile && <div className="mx-auto mt-1 mb-2 h-1 w-10 rounded-full bg-paper-muted/30" aria-hidden="true" />}
            {main.map(renderItem)}
            {feedItems.length > 0 && (
                <>
                    <div className="my-1.5 border-t border-paper-muted/12" role="separator" />
                    <p className="px-4 pt-1.5 pb-1 text-xs text-paper-muted">Flux</p>
                    {feedItems.map(renderItem)}
                </>
            )}
            <div className="my-1.5 border-t border-paper-muted/12" role="separator" />
            <button
                role="menuitem"
                onClick={() => {
                    setScopeOpen(false);
                    setAddOpen(true);
                }}
                className="w-full flex items-center gap-3 px-4 min-h-11 text-left rounded-lg text-nature font-medium hover:bg-nature/8 focus-visible:bg-nature/10 outline-none"
            >
                <span className="w-4 text-center" aria-hidden="true">+</span>
                Ajouter un flux
            </button>
            <button
                role="menuitem"
                onClick={() => {
                    setScopeOpen(false);
                    setManageOpen(true);
                }}
                className="w-full flex items-center gap-3 px-4 min-h-11 text-left rounded-lg text-paper-white hover:bg-nature/8 focus-visible:bg-nature/10 outline-none"
            >
                <span className="w-4" aria-hidden="true" />
                Gérer mes flux
            </button>
        </div>
    );

    return (
        <>
            <header className="sticky top-0 z-30 bg-carbon/95 border-b border-paper-muted/12" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
                <div className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-12 h-16 flex items-center gap-3 sm:gap-6">
                    <span className="hidden sm:block text-nature text-lg font-serif shrink-0" aria-hidden="true">
                        FlowReader
                    </span>
                    <span className="hidden sm:block h-6 w-px bg-paper-muted/20" aria-hidden="true" />

                    {/* Title = feed selector */}
                    <div className="relative min-w-0 flex-1">
                        <h1 className="min-w-0">
                            <button
                                ref={scopeBtn}
                                onClick={() => setScopeOpen((o) => !o)}
                                aria-haspopup="menu"
                                aria-expanded={scopeOpen}
                                className="group inline-flex items-center gap-2 max-w-full min-h-11 -ml-2 px-2 rounded-lg hover:bg-nature/8 transition-colors"
                            >
                                <span className="font-serif text-xl sm:text-2xl text-paper-white truncate">{current.label}</span>
                                <svg
                                    className={`w-4 h-4 shrink-0 text-paper-muted transition-transform ${scopeOpen ? 'rotate-180' : ''}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    aria-hidden="true"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M19 9l-7 7-7-7" />
                                </svg>
                                <span className="sr-only">Changer de flux</span>
                            </button>
                        </h1>
                        {scopeOpen && !isMobile && scopeList}
                    </div>

                    <button onClick={onEnterFocus} className="btn-ghost !px-3 shrink-0" title="Trier les articles non lus un par un">
                        <svg className="w-4 h-4 text-nature" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <span className="hidden sm:inline text-paper-white">Mode Focus</span>
                        <span className="sr-only sm:hidden">Mode Focus</span>
                    </button>

                    <div className="relative shrink-0">
                        <button
                            ref={menuBtn}
                            onClick={() => setMenuOpen((o) => !o)}
                            className="icon-btn !border-transparent"
                            aria-haspopup="menu"
                            aria-expanded={menuOpen}
                            aria-label="Menu"
                            title="Menu"
                        >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <circle cx="5" cy="12" r="1.8" />
                                <circle cx="12" cy="12" r="1.8" />
                                <circle cx="19" cy="12" r="1.8" />
                            </svg>
                        </button>
                        {menuOpen && (
                            <div
                                ref={menuPanel}
                                role="menu"
                                aria-label="Menu"
                                onKeyDown={onMenuKeyDown}
                                className="absolute right-0 top-full mt-2 z-50 w-64 surface-card p-2 animate-fade-in"
                            >
                                {user && <p className="px-4 pt-2 pb-2.5 text-xs text-paper-muted truncate">{user.email}</p>}
                                <button
                                    role="menuitem"
                                    onClick={() => setTheme(isDark ? 'light' : 'dark')}
                                    className="w-full flex items-center justify-between px-4 min-h-11 rounded-lg text-sm text-paper-white hover:bg-nature/8 focus-visible:bg-nature/10 outline-none"
                                >
                                    Mode sombre
                                    <span
                                        className={`relative w-9 h-5 rounded-full transition-colors ${isDark ? 'bg-nature' : 'bg-paper-muted/30'}`}
                                        aria-hidden="true"
                                    >
                                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-carbon-light shadow transition-all ${isDark ? 'left-[18px]' : 'left-0.5'}`} />
                                    </span>
                                    <span className="sr-only">{isDark ? 'activé' : 'désactivé'}</span>
                                </button>
                                <button
                                    role="menuitem"
                                    onClick={() => {
                                        setMenuOpen(false);
                                        setManageOpen(true);
                                    }}
                                    className="w-full text-left px-4 min-h-11 rounded-lg text-sm text-paper-white hover:bg-nature/8 focus-visible:bg-nature/10 outline-none"
                                >
                                    Gérer mes flux
                                </button>
                                <a
                                    role="menuitem"
                                    href="/api/v1/feeds/export/opml"
                                    onClick={() => setMenuOpen(false)}
                                    className="flex items-center px-4 min-h-11 rounded-lg text-sm text-paper-white hover:bg-nature/8 focus-visible:bg-nature/10 outline-none"
                                >
                                    Exporter mes flux (OPML)
                                </a>
                                {!isMobile && (
                                    <button
                                        role="menuitem"
                                        onClick={() => {
                                            setMenuOpen(false);
                                            setHelpOpen(true);
                                        }}
                                        className="w-full text-left px-4 min-h-11 rounded-lg text-sm text-paper-white hover:bg-nature/8 focus-visible:bg-nature/10 outline-none"
                                    >
                                        Raccourcis clavier
                                    </button>
                                )}
                                <div className="my-1.5 border-t border-paper-muted/12" role="separator" />
                                <button
                                    role="menuitem"
                                    onClick={() => logout.mutate()}
                                    className="w-full text-left px-4 min-h-11 rounded-lg text-sm text-danger hover:bg-danger/10 focus-visible:bg-danger/10 outline-none"
                                >
                                    Se déconnecter
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Mobile: the feed list opens as a bottom sheet */}
            {scopeOpen && isMobile && (
                <>
                    <div className="fixed inset-0 z-40 bg-nature-dark/45 animate-fade-in" aria-hidden="true" />
                    {scopeList}
                </>
            )}

            {addOpen && <AddFeedModal onClose={() => setAddOpen(false)} />}
            {manageOpen && (
                <ManageFeedsModal
                    onClose={() => setManageOpen(false)}
                    onDeleted={(id) => {
                        if (selectedFeedId === id) onSelectFeed(null);
                    }}
                />
            )}
            {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}
        </>
    );
}
