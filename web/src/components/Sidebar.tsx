import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import { authApi } from '../api/auth';
import { feedsApi } from '../api/feeds';
import { articlesApi } from '../api/articles';
import { AddFeedModal } from './AddFeedModal';
import { ThemeToggle } from './ThemeToggle';

interface SidebarProps {
    onSelectFeed: (feedId: string | null) => void;
    selectedFeedId: string | null;
    onEnterFocus: () => void;
    isFocusMode: boolean;
}

export function Sidebar({ onSelectFeed, selectedFeedId, onEnterFocus, isFocusMode }: SidebarProps) {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const queryClient = useQueryClient();
    const user = useAuthStore((s) => s.user);
    const logoutStore = useAuthStore((s) => s.logout);

    const { data: feeds } = useQuery({ queryKey: ['feeds'], queryFn: () => feedsApi.list() });

    const markAllReadMutation = useMutation({
        mutationFn: () => (selectedFeedId ? articlesApi.markAllRead(selectedFeedId) : articlesApi.markAllReadGlobal()),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['feeds'] });
            queryClient.invalidateQueries({ queryKey: ['articles'] });
        },
    });

    const deleteFeedMutation = useMutation({
        mutationFn: (id: string) => feedsApi.delete(id),
        onSuccess: (_, deletedId) => {
            queryClient.invalidateQueries({ queryKey: ['feeds'] });
            if (selectedFeedId === deletedId) onSelectFeed(null);
        },
    });

    const updateFeedMutation = useMutation({
        mutationFn: ({ id, title }: { id: string; title: string }) => feedsApi.update(id, title),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feeds'] }),
    });

    const logoutMutation = useMutation({
        mutationFn: () => authApi.logout(),
        onSuccess: () => { logoutStore(); window.location.href = '/login'; },
    });

    const handleDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (window.confirm('Voulez-vous vraiment supprimer ce flux ?')) deleteFeedMutation.mutate(id);
    };

    const handleRename = (e: React.MouseEvent, id: string, currentTitle: string) => {
        e.stopPropagation();
        const newTitle = window.prompt('Renommer le flux :', currentTitle);
        if (newTitle && newTitle.trim() !== '' && newTitle !== currentTitle) {
            updateFeedMutation.mutate({ id, title: newTitle.trim() });
        }
    };

    const navItem = (active: boolean) =>
        `w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-left transition-all duration-300 ${
            active
                ? 'bg-nature/10 text-nature border border-nature/20'
                : 'text-paper-muted border border-transparent hover:text-nature hover:bg-nature/5'
        }`;

    const dot = (active: boolean) =>
        `w-1.5 h-1.5 rounded-full bg-nature mr-3 transition-opacity ${active ? 'opacity-100' : 'opacity-0 group-hover/item:opacity-100'}`;

    return (
        <>
            <aside className="w-72 hidden md:flex bg-carbon-light/60 backdrop-blur-xl border-r border-paper-muted/12 h-screen flex-col z-20">
                {/* Brand + actions */}
                <div className="p-6 pb-3">
                    <div className="flex items-center justify-between mb-7">
                        <button
                            onClick={() => onSelectFeed(null)}
                            className="text-nature text-2xl font-serif italic tracking-tight hover:opacity-80 transition-opacity"
                        >
                            FlowReader
                        </button>
                        <div className="flex items-center gap-2">
                            <ThemeToggle />
                            <button onClick={() => setIsAddModalOpen(true)} className="icon-btn" title="Ajouter un flux" aria-label="Ajouter un flux">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    <button
                        onClick={() => markAllReadMutation.mutate()}
                        disabled={markAllReadMutation.isPending}
                        className="btn-secondary w-full"
                        title="Tout marquer comme lu"
                    >
                        <svg className={`w-4 h-4 ${markAllReadMutation.isPending ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            {markAllReadMutation.isPending
                                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />}
                        </svg>
                        {markAllReadMutation.isPending ? 'Traitement…' : 'Tout marquer lu'}
                    </button>
                </div>

                {/* Nav */}
                <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
                    <div className="group/item">
                        <button onClick={() => onSelectFeed(null)} className={navItem(selectedFeedId === null && !isFocusMode)}>
                            <span className="text-sm font-medium flex items-center truncate">
                                <span className={dot(selectedFeedId === null)} />Tous les articles
                            </span>
                        </button>
                    </div>

                    <div className="group/item">
                        <button onClick={() => onSelectFeed('favorites')} className={navItem(selectedFeedId === 'favorites')}>
                            <span className="text-sm font-medium flex items-center truncate">
                                <span className={dot(selectedFeedId === 'favorites')} />Mes favoris
                            </span>
                        </button>
                    </div>

                    <div className="group/item pb-2">
                        <button
                            onClick={onEnterFocus}
                            className={`w-full flex items-center px-4 py-2.5 rounded-xl text-left transition-all duration-300 ${
                                isFocusMode
                                    ? 'bg-nature text-white shadow-lg shadow-nature/20'
                                    : 'bg-nature/5 text-nature border border-nature/20 hover:bg-nature hover:text-white'
                            }`}
                        >
                            <span className="text-[11px] font-bold uppercase tracking-[0.18em] flex items-center">
                                <svg className="w-4 h-4 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                Mode Focus
                            </span>
                        </button>
                    </div>

                    <h3 className="px-4 pt-4 pb-2 text-[10px] uppercase tracking-[0.3em] font-bold text-paper-muted/40">Mes flux</h3>

                    {feeds && feeds.length > 0 ? feeds.map((feed) => (
                        <div key={feed.id} className="group/item">
                            <button onClick={() => onSelectFeed(feed.id)} className={navItem(selectedFeedId === feed.id)}>
                                <span className="text-sm font-medium flex items-center truncate">
                                    <span className={dot(selectedFeedId === feed.id)} />
                                    <span className="truncate">{feed.title}</span>
                                </span>
                                <span className="flex items-center gap-1 shrink-0">
                                    {(feed.unread_count ?? 0) > 0 && (
                                        <span className="bg-nature/15 text-nature text-[10px] px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center font-bold">
                                            {feed.unread_count}
                                        </span>
                                    )}
                                    <span
                                        role="button"
                                        tabIndex={0}
                                        onClick={(e) => handleRename(e, feed.id, feed.title)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleRename(e as unknown as React.MouseEvent, feed.id, feed.title); }}
                                        className="opacity-0 group-hover/item:opacity-60 hover:!opacity-100 p-1 text-nature transition-opacity cursor-pointer"
                                        title="Renommer le flux"
                                        aria-label="Renommer le flux"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                    </span>
                                    <span
                                        role="button"
                                        tabIndex={0}
                                        onClick={(e) => handleDelete(e, feed.id)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleDelete(e as unknown as React.MouseEvent, feed.id); }}
                                        className="opacity-0 group-hover/item:opacity-60 hover:!opacity-100 p-1 text-danger transition-opacity cursor-pointer"
                                        title="Supprimer le flux"
                                        aria-label="Supprimer le flux"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </span>
                                </span>
                            </button>
                        </div>
                    )) : (
                        <p className="px-4 py-6 text-xs text-paper-muted/50 italic font-reading">
                            Aucun flux pour l'instant. Ajoutez-en un avec le bouton +.
                        </p>
                    )}
                </nav>

                {/* Footer: user + logout */}
                <div className="p-4 border-t border-paper-muted/12">
                    <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                            <p className="text-xs font-bold text-paper-white truncate">{user?.email ?? 'Compte'}</p>
                            <p className="text-[10px] text-paper-muted uppercase tracking-widest font-bold">
                                {user?.is_admin ? 'Administrateur' : 'Lecteur'}
                            </p>
                        </div>
                        <button
                            onClick={() => logoutMutation.mutate()}
                            className="icon-btn shrink-0"
                            title="Se déconnecter"
                            aria-label="Se déconnecter"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                        </button>
                    </div>
                </div>
            </aside>

            <AddFeedModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
        </>
    );
}
