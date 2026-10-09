import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { feedsApi } from '../api/feeds';
import { authApi } from '../api/auth';
import { useAuthStore, clearUserData } from '../stores/authStore';
import { AddFeedModal } from './AddFeedModal';
import { ManageFeedsModal } from './ManageFeedsModal';
import { ThemeToggle } from './ThemeToggle';

interface TopBarProps {
    onSelectFeed: (feedId: string | null) => void;
    selectedFeedId: string | null;
    onEnterFocus: () => void;
}

/** Single navigation bar for every screen size (no sidebar). */
export function TopBar({ onSelectFeed, selectedFeedId, onEnterFocus }: TopBarProps) {
    const qc = useQueryClient();
    const [addOpen, setAddOpen] = useState(false);
    const [manageOpen, setManageOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const user = useAuthStore((s) => s.user);
    const logoutStore = useAuthStore((s) => s.logout);
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

    // Close the account menu on outside click / Escape.
    useEffect(() => {
        if (!menuOpen) return;
        const onDown = (e: MouseEvent) => {
            if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setMenuOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        window.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            window.removeEventListener('keydown', onKey);
        };
    }, [menuOpen]);

    const totalUnread = (feeds ?? []).reduce((n, f) => n + (f.unread_count ?? 0), 0);
    const items = [
        { id: null as string | null, label: 'Tous', unread: totalUnread },
        { id: 'favorites' as string | null, label: 'Favoris', unread: 0 },
        ...(feeds ?? []).map((f) => ({ id: f.id as string | null, label: f.title, unread: f.unread_count ?? 0, error: !!f.fetch_error })),
    ];

    return (
        <>
            <header
                className="sticky top-0 z-30 bg-carbon-light/95 border-b border-paper-muted/12"
                style={{ paddingTop: 'env(safe-area-inset-top)' }}
            >
                <div className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-12">
                    <div className="flex items-center justify-between gap-3 h-14">
                        <button onClick={() => onSelectFeed(null)} className="text-nature text-xl font-serif shrink-0">
                            FlowReader
                        </button>
                        <div className="flex items-center gap-1.5">
                            <button onClick={onEnterFocus} className="icon-btn" title="Mode Focus : trier les non lus" aria-label="Mode Focus">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                            </button>
                            <ThemeToggle />
                            <button onClick={() => setAddOpen(true)} className="icon-btn" title="Ajouter un flux" aria-label="Ajouter un flux">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                            </button>
                            <div className="relative" ref={menuRef}>
                                <button
                                    onClick={() => setMenuOpen((o) => !o)}
                                    className="icon-btn"
                                    aria-haspopup="menu"
                                    aria-expanded={menuOpen}
                                    aria-label="Compte et réglages"
                                    title="Compte et réglages"
                                >
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                        <circle cx="5" cy="12" r="1.8" />
                                        <circle cx="12" cy="12" r="1.8" />
                                        <circle cx="19" cy="12" r="1.8" />
                                    </svg>
                                </button>
                                {menuOpen && (
                                    <div role="menu" className="absolute right-0 top-12 w-60 surface-card py-1 z-50 animate-fade-in">
                                        {user && <p className="px-4 py-2.5 text-xs text-paper-muted truncate border-b border-paper-muted/10">{user.email}</p>}
                                        <button
                                            role="menuitem"
                                            className="w-full text-left px-4 min-h-11 text-sm text-paper-white hover:bg-nature/10"
                                            onClick={() => {
                                                setMenuOpen(false);
                                                setManageOpen(true);
                                            }}
                                        >
                                            Gérer mes flux
                                        </button>
                                        <a
                                            role="menuitem"
                                            href="/api/v1/feeds/export/opml"
                                            className="flex items-center w-full px-4 min-h-11 text-sm text-paper-white hover:bg-nature/10"
                                            onClick={() => setMenuOpen(false)}
                                        >
                                            Exporter en OPML
                                        </a>
                                        <button
                                            role="menuitem"
                                            className="w-full text-left px-4 min-h-11 text-sm text-danger hover:bg-danger/10 border-t border-paper-muted/10"
                                            onClick={() => logout.mutate()}
                                        >
                                            Se déconnecter
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Feeds */}
                    <nav className="flex gap-2 pb-3 overflow-x-auto no-scrollbar -mx-1 px-1" aria-label="Flux">
                        {items.map((item) => {
                            const active = selectedFeedId === item.id;
                            return (
                                <button
                                    key={item.id ?? 'all'}
                                    onClick={() => onSelectFeed(item.id)}
                                    aria-current={active ? 'page' : undefined}
                                    title={'error' in item && item.error ? 'Ce flux ne se met plus à jour' : undefined}
                                    className={`shrink-0 inline-flex items-center gap-1.5 min-h-10 px-3.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                                        active ? 'bg-nature text-on-nature' : 'bg-nature/10 text-paper-white/80 hover:text-nature'
                                    }`}
                                >
                                    {'error' in item && item.error && <span className="w-1.5 h-1.5 rounded-full bg-danger" aria-hidden="true" />}
                                    {item.label}
                                    {item.unread > 0 && <span className={active ? 'opacity-80' : 'text-paper-muted'}>{item.unread}</span>}
                                </button>
                            );
                        })}
                    </nav>
                </div>
            </header>

            {addOpen && <AddFeedModal onClose={() => setAddOpen(false)} />}
            {manageOpen && (
                <ManageFeedsModal
                    onClose={() => setManageOpen(false)}
                    onDeleted={(id) => {
                        if (selectedFeedId === id) onSelectFeed(null);
                    }}
                />
            )}
        </>
    );
}
