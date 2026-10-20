import { Suspense, useEffect } from 'react';
import { lazyNamed } from '../lib/lazy';
import { Sidebar } from '../components/Sidebar';
import { MobileTabBar } from '../components/MobileTabBar';
import { AddFeedModal } from '../components/AddFeedModal';
import { ManageFeedsModal } from '../components/ManageFeedsModal';
import { ShortcutsHelp } from '../components/ShortcutsHelp';
import { DashboardPage } from '../pages/DashboardPage';
import { useWebsocket } from '../hooks/useWebsocket';
import { useIsMobile } from '../hooks/useIsMobile';
import { useUI } from '../stores/uiStore';

// Focus mode carries the gesture/animation code, search and the feeds tab are
// secondary screens: load them only when used.
const FocusPage = lazyNamed(() => import('../pages/FocusPage'), 'FocusPage');
const FeedsPage = lazyNamed(() => import('../pages/FeedsPage'), 'FeedsPage');
const SearchPanel = lazyNamed(() => import('../components/SearchPanel'), 'SearchPanel');

function isTypingTarget(t: EventTarget | null) {
    const el = t as HTMLElement | null;
    return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

function Spinner() {
    return (
        <div className="flex-1 flex items-center justify-center" role="status" aria-label="Chargement">
            <div className="w-10 h-10 border-2 border-nature/20 border-t-nature rounded-full animate-spin" />
        </div>
    );
}

/**
 * App shell. Desktop (≥1280px): feeds · list · reader. Tablet: list · reader,
 * the feeds in a drawer. Phone: one column with a bottom tab bar.
 */
export function RootLayout() {
    const isMobile = useIsMobile();
    const tab = useUI((s) => s.tab);
    const focusOpen = useUI((s) => s.focusOpen);
    const searchOpen = useUI((s) => s.searchOpen);
    const drawerOpen = useUI((s) => s.drawerOpen);
    const dialog = useUI((s) => s.dialog);
    const scope = useUI((s) => s.scope);
    const setScope = useUI((s) => s.setScope);
    const setFocusOpen = useUI((s) => s.setFocusOpen);
    const setSearchOpen = useUI((s) => s.setSearchOpen);
    const setDrawerOpen = useUI((s) => s.setDrawerOpen);
    const openDialog = useUI((s) => s.openDialog);

    // One socket for the whole session (not per page mount).
    useWebsocket();

    // ⌘K / Ctrl+K or "/" opens search from anywhere.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const palette = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
            const slash = e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target);
            if ((palette || slash) && !focusOpen) {
                e.preventDefault();
                setSearchOpen(true);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [focusOpen, setSearchOpen]);

    // The drawer closes with Escape and when the screen grows past it.
    useEffect(() => {
        if (!drawerOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setDrawerOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [drawerOpen, setDrawerOpen]);

    const showFeeds = isMobile && tab === 'feeds';

    return (
        <div className="flex h-dvh bg-carbon overflow-hidden">
            <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[80] btn-primary">
                Aller au contenu
            </a>

            {/* Desktop: permanent sidebar */}
            <aside className="hidden xl:block w-[248px] shrink-0 bg-carbon border-r border-line">
                <Sidebar />
            </aside>

            {/* Tablet: the same sidebar as a drawer */}
            {drawerOpen && !isMobile && (
                <div className="xl:hidden fixed inset-0 z-40 flex" role="dialog" aria-modal="true" aria-label="Mes flux">
                    <div className="w-[280px] max-w-[85vw] h-full bg-carbon border-r border-line shadow-[var(--shadow-float)] animate-slide-in">
                        <Sidebar />
                    </div>
                    <button className="flex-1 bg-nature-dark/40 animate-fade-in" onClick={() => setDrawerOpen(false)} aria-label="Fermer la liste des flux" />
                </div>
            )}

            <div id="main-content" className="flex-1 min-w-0 flex flex-col">
                {/* Kept mounted behind focus mode and the feeds tab so the list keeps its scroll position. */}
                <DashboardPage hidden={focusOpen || showFeeds} />
                {showFeeds && (
                    <Suspense fallback={<Spinner />}>
                        <FeedsPage />
                    </Suspense>
                )}
                {!focusOpen && <MobileTabBar />}
            </div>

            {focusOpen && (
                <Suspense
                    fallback={
                        <div className="fixed inset-0 z-50 bg-carbon flex items-center justify-center" role="status" aria-label="Chargement">
                            <div className="w-12 h-12 border-2 border-nature/20 border-t-nature rounded-full animate-spin" />
                        </div>
                    }
                >
                    <FocusPage onExit={() => setFocusOpen(false)} />
                </Suspense>
            )}

            {searchOpen && (
                <Suspense fallback={null}>
                    <SearchPanel />
                </Suspense>
            )}

            {dialog === 'add' && <AddFeedModal onClose={() => openDialog(null)} />}
            {dialog === 'manage' && (
                <ManageFeedsModal
                    onClose={() => openDialog(null)}
                    onDeleted={(id) => {
                        if (scope === id) setScope(null);
                    }}
                />
            )}
            {dialog === 'help' && <ShortcutsHelp onClose={() => openDialog(null)} />}
        </div>
    );
}
