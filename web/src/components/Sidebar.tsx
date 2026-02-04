import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { feedsApi } from '../api/feeds';
import { AddFeedModal } from './AddFeedModal';

interface SidebarProps {
    onSelectFeed: (feedId: string | null) => void;
    selectedFeedId: string | null;
}

export function Sidebar({ onSelectFeed, selectedFeedId }: SidebarProps) {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const { data: feeds } = useQuery({
        queryKey: ['feeds'],
        queryFn: () => feedsApi.list(),
    });

    return (
        <>
            <aside className="w-72 bg-carbon-dark/50 backdrop-blur-xl border-r border-white/5 h-screen flex flex-col z-20">
                <div className="p-8 pb-4">
                    <div className="flex items-center justify-between mb-8">
                        <h1 className="text-gold text-2xl font-serif italic tracking-tight">FlowReader</h1>
                        <button
                            onClick={() => setIsAddModalOpen(true)}
                            className="w-8 h-8 flex items-center justify-center rounded-full border border-gold/20 text-gold hover:bg-gold hover:text-carbon transition-all duration-300 shadow-sm"
                            title="Ajouter un flux"
                        >
                            <span className="text-xl leading-none">+</span>
                        </button>
                    </div>

                    <nav className="space-y-1">
                        <button
                            onClick={() => onSelectFeed(null)}
                            className={`w-full group flex items-center justify-between px-4 py-3 rounded-lg transition-all duration-300 ${selectedFeedId === null
                                    ? 'bg-gold/10 text-gold-bright shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]'
                                    : 'text-paper-muted hover:text-white hover:bg-white/5'
                                }`}
                        >
                            <span className="text-xs uppercase tracking-[0.2em] font-bold">Tout voir</span>
                        </button>
                    </nav>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
                    <div>
                        <h3 className="px-4 text-[10px] uppercase tracking-[0.3em] font-black text-paper-muted/30 mb-4">Bibliothèque</h3>
                        <div className="space-y-1">
                            {feeds?.map((feed) => (
                                <button
                                    key={feed.id}
                                    onClick={() => onSelectFeed(feed.id)}
                                    className={`w-full group flex items-center justify-between px-4 py-2.5 rounded-lg transition-all duration-300 text-left ${selectedFeedId === feed.id
                                            ? 'bg-gold/10 text-gold-bright'
                                            : 'text-paper-muted hover:text-white hover:bg-white/5'
                                        }`}
                                >
                                    <span className="text-sm font-medium truncate flex items-center">
                                        <span className="w-1.5 h-1.5 rounded-full bg-gold/40 mr-3 opacity-0 group-hover:opacity-100 transition-opacity"></span>
                                        {feed.title}
                                    </span>
                                    {(feed.unread_count ?? 0) > 0 && (
                                        <span className="bg-gold/20 text-gold text-[10px] px-1.5 py-0.5 rounded-full min-w-[1.2rem] text-center font-bold">
                                            {feed.unread_count}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-white/5">
                    <div className="p-4 rounded-xl bg-gold/5 border border-gold/10">
                        <p className="text-[10px] text-gold/60 uppercase tracking-widest font-bold mb-1">Mode Zen</p>
                        <p className="text-[9px] text-paper-muted leading-relaxed italic">"Le silence est le bruit des esprits."</p>
                    </div>
                </div>
            </aside>

            <AddFeedModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
            />
        </>
    );
}
