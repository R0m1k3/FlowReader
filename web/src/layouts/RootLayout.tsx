import { useState } from 'react';
import { Sidebar } from '../components/Sidebar';
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
                <DashboardPage
                    selectedFeedId={selectedFeedId}
                    onEnterFocus={() => setIsFocusMode(true)}
                />
            )}
        </div>
    );
}
