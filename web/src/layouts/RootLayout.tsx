import { Suspense, useState } from 'react';
import { lazyNamed } from '../lib/lazy';
import { Sidebar } from '../components/Sidebar';
import { MobileTopBar } from '../components/MobileTopBar';
import { DashboardPage } from '../pages/DashboardPage';
import { useWebsocket } from '../hooks/useWebsocket';

// Focus mode carries the gesture/animation code: load it only when used.
const FocusPage = lazyNamed(() => import('../pages/FocusPage'), 'FocusPage');

export function RootLayout() {
    const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
    const [isFocusMode, setIsFocusMode] = useState(false);

    // One socket for the whole session (not per page mount).
    useWebsocket();

    return (
        <div className="flex h-dvh bg-carbon overflow-hidden">
            <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[80] btn-primary">
                Aller au contenu
            </a>
            <Sidebar
                onSelectFeed={setSelectedFeedId}
                selectedFeedId={selectedFeedId}
                onEnterFocus={() => setIsFocusMode(true)}
                isFocusMode={isFocusMode}
            />

            <div id="main-content" className="flex-1 flex flex-col min-w-0">
                {!isFocusMode && (
                    <MobileTopBar
                        onSelectFeed={setSelectedFeedId}
                        selectedFeedId={selectedFeedId}
                        onEnterFocus={() => setIsFocusMode(true)}
                    />
                )}
                {/* Kept mounted in focus mode so the list keeps its scroll position. */}
                <DashboardPage selectedFeedId={selectedFeedId} hidden={isFocusMode} />
            </div>

            {isFocusMode && (
                <Suspense
                    fallback={
                        <div className="fixed inset-0 z-50 bg-carbon flex items-center justify-center" role="status" aria-label="Chargement">
                            <div className="w-12 h-12 border-2 border-nature/20 border-t-nature rounded-full animate-spin" />
                        </div>
                    }
                >
                    <FocusPage onExit={() => setIsFocusMode(false)} />
                </Suspense>
            )}
        </div>
    );
}
