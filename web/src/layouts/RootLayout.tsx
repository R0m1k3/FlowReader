import { useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { MobileTopBar } from '../components/MobileTopBar';
import { DashboardPage } from '../pages/DashboardPage';
import { FocusPage } from '../pages/FocusPage';

export function RootLayout() {
    const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
    const [isFocusMode, setIsFocusMode] = useState(false);

    return (
        <div className="flex h-screen bg-carbon overflow-hidden">
            <Sidebar
                onSelectFeed={setSelectedFeedId}
                selectedFeedId={selectedFeedId}
                onEnterFocus={() => setIsFocusMode(true)}
                isFocusMode={isFocusMode}
            />

            {isFocusMode ? (
                <FocusPage onExit={() => setIsFocusMode(false)} />
            ) : (
                <div className="flex-1 flex flex-col min-w-0">
                    <MobileTopBar
                        onSelectFeed={setSelectedFeedId}
                        selectedFeedId={selectedFeedId}
                        onEnterFocus={() => setIsFocusMode(true)}
                    />
                    <DashboardPage selectedFeedId={selectedFeedId} onEnterFocus={() => setIsFocusMode(true)} />
                </div>
            )}
        </div>
    );
}
