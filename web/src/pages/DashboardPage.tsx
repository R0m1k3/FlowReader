import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { authApi } from '../api/auth';
import { articlesApi } from '../api/articles';
import type { Article } from '../api/articles';
import { Sidebar } from '../components/Sidebar';
import { ArticleCard } from '../components/ArticleCard';
import { ReaderView } from '../components/ReaderView';
import { useWebsocket } from '../hooks/useWebsocket';

export function DashboardPage() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { user, logout } = useAuthStore();

    // Initialize WebSocket for real-time updates
    useWebsocket();

    const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
    const [viewingArticle, setViewingArticle] = useState<Article | null>(null);

    const { data: articles, isLoading } = useQuery({
        queryKey: ['articles', selectedFeedId],
        queryFn: () => articlesApi.list({
            unread: true,
            feed_id: (selectedFeedId && selectedFeedId !== 'favorites') ? selectedFeedId : undefined,
            favorite: selectedFeedId === 'favorites' ? true : undefined
        }),
    });

    const toggleReadMutation = useMutation({
        mutationFn: ({ id, is_read }: { id: string, is_read: boolean }) =>
            is_read ? articlesApi.markUnread(id) : articlesApi.markRead(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['articles'] });
            queryClient.invalidateQueries({ queryKey: ['feeds'] });
        },
    });

    const toggleFavoriteMutation = useMutation({
        mutationFn: ({ id }: { id: string }) => articlesApi.toggleFavorite(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['articles'] });
        },
    });

    const markAllReadMutation = useMutation({
        mutationFn: () => selectedFeedId && selectedFeedId !== 'favorites'
            ? articlesApi.markAllRead(selectedFeedId)
            : articlesApi.markAllReadGlobal(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['articles'] });
            queryClient.invalidateQueries({ queryKey: ['feeds'] });
        },
    });

    const handleLogout = async () => {
        await authApi.logout();
        logout();
        navigate('/login');
    };

    const handleArticleClick = async (article: Article) => {
        try {
            const fullArticle = await articlesApi.get(article.id);
            setViewingArticle(fullArticle);
            if (!article.is_read) {
                toggleReadMutation.mutate({ id: article.id, is_read: false });
            }
        } catch (err) {
            console.error('Failed to load article', err);
        }
    };

    return (
        <div className="flex h-screen bg-carbon overflow-hidden">
            <Sidebar
                onSelectFeed={setSelectedFeedId}
                selectedFeedId={selectedFeedId}
            />

            <div className="flex-1 flex flex-col min-w-0 bg-carbon overflow-hidden relative">
                <header className="h-20 border-b border-carbon-dark/50 flex items-center justify-between px-8 bg-carbon/50 backdrop-blur-md z-10 shrink-0">
                    <div className="min-w-0">
                        <h1 className="text-gold text-2xl md:text-3xl font-serif italic truncate">
                            {selectedFeedId === 'favorites' ? 'Mes Favoris' : 'Nouveautés'}
                        </h1>
                        <p className="text-paper-muted text-[10px] uppercase tracking-widest font-bold">
                            {articles?.length || 0} ARTICLES À DÉCOUVRIR
                        </p>
                    </div>

                    <div className="flex items-center space-x-6 shrink-0">
                        {articles && articles.length > 0 && selectedFeedId !== 'favorites' && (
                            <button
                                className="btn-secondary text-[10px] uppercase tracking-widest font-bold py-2 px-4 border-gold/30 hidden md:block"
                                onClick={() => markAllReadMutation.mutate()}
                                disabled={markAllReadMutation.isPending}
                            >
                                {markAllReadMutation.isPending ? 'Patientez...' : 'Tout marquer lu'}
                            </button>
                        )}

                        <div className="flex items-center space-x-4 border-l border-carbon-dark/50 pl-6">
                            <div className="text-right hidden sm:block">
                                <p className="text-paper-white text-xs font-medium truncate max-w-[150px]">{user?.email}</p>
                                <button onClick={handleLogout} className="text-paper-muted hover:text-gold text-[10px] uppercase tracking-tighter transition-colors">
                                    Déconnexion
                                </button>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center text-gold font-serif text-lg shrink-0">
                                {user?.email?.[0].toUpperCase() || 'M'}
                            </div>
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto px-4 md:px-8 py-10">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-full space-y-4 opacity-50">
                            <div className="w-12 h-12 border-2 border-gold/20 border-t-gold rounded-full animate-spin" />
                            <p className="text-gold text-xs uppercase tracking-widest animate-pulse">Édition en cours...</p>
                        </div>
                    ) : articles?.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center space-y-6 animate-in fade-in duration-1000">
                            <div className="text-6xl filter grayscale opacity-30">💆‍♂️</div>
                            <div className="max-w-md">
                                <h2 className="text-paper-white text-2xl font-serif mb-2">Immersion Totale</h2>
                                <p className="text-paper-muted font-reading text-lg">
                                    Vous avez épuisé vos flux. Profitez de ce moment de silence.
                                </p>
                            </div>
                            <button
                                className="btn-secondary text-[10px] uppercase tracking-[0.2em] font-bold"
                                onClick={() => queryClient.invalidateQueries({ queryKey: ['articles'] })}
                            >
                                Actualiser
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-8">
                            {articles?.map((article: Article, index: number) => (
                                <div
                                    key={article.id}
                                    className={`${index === 0 ? 'md:col-span-2' : ''} animate-in fade-in slide-in-from-bottom-4 duration-500`}
                                    style={{ animationDelay: `${index * 50}ms` }}
                                >
                                    <ArticleCard
                                        article={article}
                                        onClick={handleArticleClick}
                                        onToggleRead={(id, is_read) => toggleReadMutation.mutate({ id, is_read })}
                                        onToggleFavorite={(id) => toggleFavoriteMutation.mutate({ id })}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </main>
            </div>

            {viewingArticle && (
                <ReaderView
                    article={viewingArticle}
                    onClose={() => setViewingArticle(null)}
                    onToggleFavorite={(id) => toggleFavoriteMutation.mutate({ id })}
                />
            )}
        </div>
    );
}
