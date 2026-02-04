import { useQuery } from '@tanstack/react-query';
import { feedsApi } from '../api/feeds';

interface SidebarProps {
    onSelectFeed: (feedId: string | null) => void;
    selectedFeedId: string | null;
}

export function Sidebar({ onSelectFeed, selectedFeedId }: SidebarProps) {
    const { data: feeds } = useQuery({
        queryKey: ['feeds'],
        queryFn: () => feedsApi.list(),
    });

    return (
        <aside className="w-64 bg-carbon-light border-r border-carbon-dark h-screen flex flex-col transition-all duration-300 shrink-0">
            <div className="p-6">
                <h1 className="text-gold text-2xl font-serif tracking-tight">FlowReader</h1>
                <p className="text-paper-muted text-[10px] mt-1 uppercase tracking-[0.2em] font-sans">Magazine Instantané</p>
            </div>

            <nav className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
                <button
                    onClick={() => onSelectFeed(null)}
                    className={`w-full text-left px-4 py-3 rounded-md transition-all duration-200 flex items-center space-x-3 group ${selectedFeedId === null
                        ? 'bg-gold/10 text-gold border-l-4 border-gold'
                        : 'text-paper-white hover:bg-carbon-dark'
                        }`}
                >
                    <span className="text-lg group-hover:scale-110 transition-transform">📰</span>
                    <span className="font-medium">Nouveautés</span>
                </button>

                <button
                    onClick={() => onSelectFeed('favorites')}
                    className={`w-full text-left px-4 py-3 rounded-md transition-all duration-200 flex items-center space-x-3 group ${selectedFeedId === 'favorites'
                        ? 'bg-gold/10 text-gold border-l-4 border-gold'
                        : 'text-paper-white hover:bg-carbon-dark'
                        }`}
                >
                    <span className="text-lg group-hover:scale-110 transition-transform">⭐</span>
                    <span className="font-medium">Favoris</span>
                </button>

                <div className="pt-8 pb-2 px-4">
                    <span className="text-paper-muted text-[10px] uppercase tracking-[0.3em] font-bold">Mes Flux</span>
                </div>

                <div className="space-y-1">
                    {feeds?.map((feed) => (
                        <button
                            key={feed.id}
                            onClick={() => onSelectFeed(feed.id)}
                            className={`w-full text-left px-4 py-2 rounded-md transition-all duration-200 truncate group flex justify-between items-center ${selectedFeedId === feed.id
                                ? 'bg-gold/5 text-gold'
                                : 'text-paper-muted hover:text-paper-white hover:bg-carbon-dark'
                                }`}
                        >
                            <span className="truncate">
                                <span className="mr-2 opacity-30 group-hover:opacity-100 transition-opacity">#</span>
                                {feed.title}
                            </span>
                            {(feed.unread_count ?? 0) > 0 && (
                                <span className="bg-gold/20 text-gold text-[10px] px-1.5 py-0.5 rounded-full min-w-[1.2rem] text-center">
                                    {feed.unread_count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </nav>

            <div className="p-6 border-t border-carbon-dark bg-carbon-dark/20">
                <div className="flex items-center space-x-3 text-paper-muted hover:text-gold cursor-pointer transition-all duration-300 group">
                    <div className="w-8 h-8 rounded-full bg-carbon border border-carbon-light flex items-center justify-center group-hover:border-gold group-hover: gold-glow transition-all">
                        <span className="text-sm">⚙️</span>
                    </div>
                    <span className="text-sm font-medium">Paramètres</span>
                </div>
            </div>
        </aside>
    );
}
