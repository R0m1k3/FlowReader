import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { feedsApi } from '../api/feeds';
import { articlesApi } from '../api/articles';
import { AddFeedModal } from './AddFeedModal';

interface SidebarProps {
    onSelectFeed: (feedId: string | null) => void;
    selectedFeedId: string | null;
}

export function Sidebar({ onSelectFeed, selectedFeedId }: SidebarProps) {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const queryClient = useQueryClient();

    const { data: feeds } = useQuery({
        queryKey: ['feeds'],
        queryFn: () => feedsApi.list(),
    });

    const markAllReadMutation = useMutation({
        mutationFn: () => {
            if (selectedFeedId) {
                return articlesApi.markAllRead(selectedFeedId);
            }
            return articlesApi.markAllReadGlobal();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['feeds'] });
            queryClient.invalidateQueries({ queryKey: ['articles'] });
        },
    });

    // ... (deleteFeedMutation)

    // ...

    return (
        <>
            <aside className="w-72 bg-carbon-dark/50 backdrop-blur-xl border-r border-white/5 h-screen flex flex-col z-20">
                <div className="p-8 pb-4">
                    <div className="flex items-center justify-between mb-8">
                        <h1
                            className="text-gold text-3xl font-serif italic tracking-tight cursor-pointer hover:opacity-80 transition-opacity"
                            style={{ textShadow: '1px 1px 2px rgba(100, 100, 100, 0.5)' }}
                            onClick={() => onSelectFeed(null)}
                        >
                            FlowReader
                        </h1>
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
                            onClick={() => markAllReadMutation.mutate()}
                            disabled={markAllReadMutation.isPending}
                            className={`w-full group flex items-center justify-center space-x-3 px-4 py-3 rounded-lg transition-all duration-300 border ${markAllReadMutation.isPending
                                ? 'bg-gold/5 border-gold/10 text-gold/50 cursor-wait'
                                : 'bg-transparent border-gold/20 text-paper-muted hover:text-gold hover:bg-gold/5 hover:border-gold/40'
                                }`}
                            title="Tout marquer comme lu"
                        >
                            <svg className={`w-4 h-4 ${markAllReadMutation.isPending ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                {markAllReadMutation.isPending
                                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                                }
                            </svg>
                            <span className="text-xs uppercase tracking-[0.2em] font-bold">
                                {markAllReadMutation.isPending ? 'Traitement...' : 'Tout marquer lu'}
                            </span>
                        </button>
                    </nav>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
                    <div>
                        <h3 className="px-4 text-[10px] uppercase tracking-[0.3em] font-black text-paper-muted/30 mb-4">Bibliothèque</h3>
                        <div className="space-y-1">
                            {feeds?.map((feed) => (
                                <div key={feed.id} className="relative group/item">
                                    <button
                                        onClick={() => onSelectFeed(feed.id)}
                                        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg transition-all duration-300 text-left ${selectedFeedId === feed.id
                                            ? 'bg-gold/10 text-gold-bright'
                                            : 'text-paper-muted hover:text-gold hover:bg-gold/5'
                                            }`}
                                    >
                                        <span className="text-sm font-medium truncate flex items-center">
                                            <span className={`w-1.5 h-1.5 rounded-full bg-gold/40 mr-3 transition-opacity ${selectedFeedId === feed.id ? 'opacity-100' : 'opacity-0 group-hover/item:opacity-100'}`}></span>
                                            {feed.title}
                                        </span>

                                        <div className="flex items-center space-x-2">
                                            {(feed.unread_count ?? 0) > 0 && (
                                                <span className="bg-gold/20 text-gold text-[10px] px-1.5 py-0.5 rounded-full min-w-[1.2rem] text-center font-bold">
                                                    {feed.unread_count}
                                                </span>
                                            )}
                                            <button
                                                onClick={(e) => handleDelete(e, feed.id)}
                                                className="opacity-0 group-hover/item:opacity-50 hover:!opacity-100 p-1 text-red-400 transition-all duration-300 transform scale-75 hover:scale-100"
                                                title="Supprimer le flux"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    </button>
                                </div>
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
