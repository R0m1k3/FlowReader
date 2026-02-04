import { useQuery } from '@tanstack/react-query';
import { feedsApi } from '../api/feeds';
import type { Feed } from '../api/feeds';

interface SidebarProps {
    onSelectFeed: (feedId: string | null) => void;
    selectedFeedId: string | null;
}

export function Sidebar({ onSelectFeed, selectedFeedId }: SidebarProps) {
    const { data: feeds, isLoading } = useQuery({
        queryKey: ['feeds'],
        queryFn: feedsApi.list,
    });

    return (
        <aside className="sidebar">
            <nav className="sidebar-nav">
                <button
                    className={`nav-item ${selectedFeedId === null ? 'active' : ''}`}
                    onClick={() => onSelectFeed(null)}
                >
                    <span className="icon">📥</span>
                    <span className="label">Tous les flux</span>
                </button>

                <button
                    className={`nav-item ${selectedFeedId === 'favorites' ? 'active' : ''}`}
                    onClick={() => onSelectFeed('favorites')}
                >
                    <span className="icon">★</span>
                    <span className="label">Favoris</span>
                </button>

                <div className="sidebar-section">
                    <h3>Flux</h3>
                    {isLoading ? (
                        <div className="sidebar-loading">Chargement...</div>
                    ) : (
                        <div className="feed-list">
                            {feeds?.map((feed: Feed) => (
                                <button
                                    key={feed.id}
                                    className={`nav-item ${selectedFeedId === feed.id ? 'active' : ''}`}
                                    onClick={() => onSelectFeed(feed.id)}
                                >
                                    <span className="icon">📄</span>
                                    <span className="label">{feed.title}</span>
                                    {feed.unread_count ? (
                                        <span className="badge">{feed.unread_count}</span>
                                    ) : null}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </nav>

            <div className="sidebar-footer">
                <button className="add-feed-btn" onClick={() => {/* TODO: Add feed modal */ }}>
                    + Ajouter un flux
                </button>
            </div>
        </aside>
    );
}
