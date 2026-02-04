import { useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { DashboardPage } from '../pages/DashboardPage';

export function RootLayout() {
    const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);

    return (
        <div className="flex h-screen bg-carbon overflow-hidden">
            <Sidebar
                onSelectFeed={setSelectedFeedId}
                selectedFeedId={selectedFeedId}
            />
            <DashboardPage
                selectedFeedId={selectedFeedId}
            />
        </div>
    );
}
