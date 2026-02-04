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
            // Fetch full content and sanitize
            const fullArticle = await articlesApi.get(article.id);
            setViewingArticle(fullArticle);

            // Mark as read automatically
            if (!article.is_read) {
                toggleReadMutation.mutate({ id: article.id, is_read: false });
            }
        } catch (err) {
            console.error('Failed to load article', err);
        }
    };

    return (
        <div className="dashboard-layout">
            <Sidebar
                onSelectFeed={setSelectedFeedId}
                selectedFeedId={selectedFeedId}
            />

            <div className="dashboard-content">
                <header className="dashboard-header">
                    <h1>{selectedFeedId === 'favorites' ? 'Favoris' : 'Nouveautés'}</h1>

                    <div className="header-actions">
                        {articles && articles.length > 0 && selectedFeedId !== 'favorites' && (
                            <button
                                className="mark-all-read-btn"
                                onClick={() => markAllReadMutation.mutate()}
                                disabled={markAllReadMutation.isPending}
                            >
                                {markAllReadMutation.isPending ? 'Chargement...' : 'Tout marquer comme lu'}
                            </button>
                        )}

                        <div className="user-info">
                            <span>{user?.email}</span>
                            <button onClick={handleLogout} className="logout-btn">
                                Déconnexion
                            </button>
                        </div>
                    </div>
                </header>

                <main className="articles-main">
                    {isLoading ? (
                        <div className="loading-state">
                            <div className="spinner"></div>
                        </div>
                    ) : articles?.length === 0 ? (
                        <div className="empty-state">
                            <h2>🎉 Tout est lu !</h2>
                            <p>Revenez plus tard pour de nouveaux articles.</p>
                        </div>
                    ) : (
                        <div className="articles-grid">
                            {articles?.map((article: Article) => (
                                <ArticleCard
                                    key={article.id}
                                    article={article}
                                    onClick={handleArticleClick}
                                    onToggleRead={(id, is_read) => toggleReadMutation.mutate({ id, is_read })}
                                    onToggleFavorite={(id) => toggleFavoriteMutation.mutate({ id })}
                                />
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
