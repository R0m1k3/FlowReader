import { useRef, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { usePrefs } from '../stores/prefsStore';
import { useUI } from '../stores/uiStore';
import { useFeeds, useTotalUnread } from '../hooks/useFeeds';
import { useLogout } from '../hooks/useLogout';
import { onMenuKeyDown, useDismiss } from '../hooks/useDismiss';
import { Icon } from './Icon';
import { FeedAvatar } from './FeedAvatar';

function isDarkNow(theme: string) {
    return theme === 'dark' || (theme === 'system' && document.documentElement.classList.contains('dark'));
}

/**
 * Feed navigation: always visible on desktop, a drawer on tablets.
 * Mobile uses the "Flux" tab instead (FeedsPage).
 */
export function Sidebar() {
    const { data: feeds } = useFeeds();
    const totalUnread = useTotalUnread();
    const scope = useUI((s) => s.scope);
    const setScope = useUI((s) => s.setScope);
    const setFocusOpen = useUI((s) => s.setFocusOpen);
    const setSearchOpen = useUI((s) => s.setSearchOpen);
    const openDialog = useUI((s) => s.openDialog);
    const user = useAuthStore((s) => s.user);
    const theme = usePrefs((s) => s.theme);
    const setTheme = usePrefs((s) => s.setTheme);
    const logout = useLogout();

    const [menuOpen, setMenuOpen] = useState(false);
    const menuBtn = useRef<HTMLButtonElement>(null);
    const menuPanel = useRef<HTMLDivElement>(null);
    const closeMenu = () => {
        setMenuOpen(false);
        menuBtn.current?.focus();
    };
    useDismiss(menuOpen, closeMenu, [menuBtn, menuPanel]);

    const dark = isDarkNow(theme);
    const menuItem = 'w-full text-left flex items-center px-3 min-h-11 rounded-lg text-sm text-paper-white hover:bg-carbon-dark focus-visible:bg-carbon-dark outline-none';

    return (
        <nav aria-label="Navigation principale" className="h-full flex flex-col gap-5 px-3.5 pt-5 pb-3 overflow-y-auto overscroll-contain">
            <div className="flex items-center gap-2.5 px-2">
                <span aria-hidden="true" className="w-[30px] h-[30px] rounded-[9px] bg-nature text-on-nature flex items-center justify-center font-serif font-bold text-[19px] leading-none">F</span>
                <span className="font-serif text-[21px] font-semibold tracking-tight text-paper-white">FlowReader</span>
            </div>

            <button
                onClick={() => setSearchOpen(true)}
                className="flex items-center gap-2.5 min-h-11 px-3 rounded-xl border border-line bg-carbon-light text-paper-muted text-sm text-left hover:text-paper-white transition-colors"
                title="Rechercher (⌘K ou /)"
            >
                <Icon name="search" size={18} />
                <span className="flex-1">Rechercher</span>
                <kbd className="kbd !h-5 !text-[11px] !bg-carbon !shadow-none text-paper-muted">⌘K</kbd>
            </button>

            <ul role="list" className="flex flex-col gap-0.5">
                <li>
                    <button className="nav-item" aria-current={scope === null ? 'page' : undefined} onClick={() => setScope(null)}>
                        <Icon name="inbox" size={18} className="text-nature" />
                        <span className="flex-1">À lire</span>
                        {totalUnread > 0 && <span className="text-xs font-semibold text-nature tabular-nums">{totalUnread}</span>}
                    </button>
                </li>
                <li>
                    <button className="nav-item" aria-current={scope === 'favorites' ? 'page' : undefined} onClick={() => setScope('favorites')}>
                        <Icon name="star" size={18} className="text-paper-muted" />
                        <span className="flex-1">Favoris</span>
                    </button>
                </li>
                <li>
                    <button className="nav-item" onClick={() => setFocusOpen(true)} title="Trier les non lus un par un">
                        <Icon name="bolt" size={18} className="text-paper-muted" />
                        <span className="flex-1">Mode Focus</span>
                    </button>
                </li>
            </ul>

            <div className="flex flex-col gap-1 min-h-0">
                <div className="flex items-center justify-between pl-2.5">
                    <h2 className="font-sans text-xs font-semibold text-paper-muted">Mes flux</h2>
                    <button onClick={() => openDialog('add')} className="tool-btn !text-nature" aria-label="Ajouter un flux" title="Ajouter un flux">
                        <Icon name="plus" size={18} strokeWidth={2} />
                    </button>
                </div>
                {feeds && feeds.length === 0 && (
                    <p className="px-2.5 text-sm text-paper-muted">Aucun flux pour l’instant. Ajoutez-en un avec +.</p>
                )}
                <ul role="list" className="flex flex-col gap-px">
                    {(feeds ?? []).map((f) => (
                        <li key={f.id}>
                            <button
                                className="nav-item !min-h-9 !gap-2.5"
                                aria-current={scope === f.id ? 'page' : undefined}
                                onClick={() => setScope(f.id)}
                                title={f.fetch_error ? `Ce flux ne se met plus à jour : ${f.fetch_error}` : undefined}
                            >
                                <FeedAvatar id={f.id} title={f.title} />
                                <span className="flex-1 min-w-0 truncate">{f.title}</span>
                                {f.fetch_error ? (
                                    <span className="text-xs font-semibold text-danger">erreur</span>
                                ) : (f.unread_count ?? 0) > 0 ? (
                                    <span className="text-xs text-paper-muted tabular-nums">{f.unread_count}</span>
                                ) : null}
                            </button>
                        </li>
                    ))}
                </ul>
            </div>

            <div className="mt-auto pt-3 border-t border-line flex items-center gap-1 pl-2">
                <span className="flex-1 min-w-0 text-[13px] text-paper-muted truncate">{user?.email}</span>
                <button
                    onClick={() => setTheme(dark ? 'light' : 'dark')}
                    className="tool-btn"
                    aria-label={dark ? 'Passer en mode clair' : 'Passer en mode sombre'}
                    title={dark ? 'Mode clair' : 'Mode sombre'}
                >
                    <Icon name={dark ? 'sun' : 'moon'} size={18} />
                </button>
                <div className="relative">
                    <button
                        ref={menuBtn}
                        onClick={() => setMenuOpen((o) => !o)}
                        className="tool-btn"
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        aria-label="Plus d’options"
                        title="Plus d’options"
                    >
                        <Icon name="more" size={20} />
                    </button>
                    {menuOpen && (
                        <div
                            ref={menuPanel}
                            role="menu"
                            aria-label="Options"
                            onKeyDown={onMenuKeyDown}
                            className="absolute right-0 bottom-full mb-2 z-50 w-60 surface-card p-1.5 animate-fade-in"
                        >
                            <button role="menuitem" autoFocus className={menuItem} onClick={() => { setMenuOpen(false); openDialog('manage'); }}>
                                Gérer mes flux
                            </button>
                            <a role="menuitem" href="/api/v1/feeds/export/opml" className={menuItem} onClick={() => setMenuOpen(false)}>
                                Exporter mes flux (OPML)
                            </a>
                            <button role="menuitem" className={menuItem} onClick={() => { setMenuOpen(false); openDialog('help'); }}>
                                Raccourcis clavier
                            </button>
                            <div className="my-1 border-t border-line" role="separator" />
                            <button role="menuitem" className={`${menuItem} !text-danger hover:!bg-danger/10`} onClick={() => logout.mutate()}>
                                Se déconnecter
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </nav>
    );
}
