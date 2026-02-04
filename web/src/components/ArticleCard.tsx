import type { Article } from '../api/articles';

interface ArticleCardProps {
    article: Article;
    onClick: (article: Article) => void;
    onToggleRead: (id: string, currentStatus: boolean) => void;
    onToggleFavorite: (id: string, currentStatus: boolean) => void;
}

export function ArticleCard({ article, onClick, onToggleRead, onToggleFavorite }: ArticleCardProps) {
    const publishedDate = article.published_at
        ? new Date(article.published_at).toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        })
        : '';

    return (
        <div
            className={`article-card ${article.is_read ? 'read' : 'unread'}`}
            onClick={() => onClick(article)}
        >
            <div className="article-header">
                <span className="feed-title">{article.feed_title}</span>
                <span className="published-date">{publishedDate}</span>
            </div>

            <h3 className="article-title">{article.title}</h3>

            {article.summary && (
                <p className="article-excerpt">
                    {article.summary.replace(/<[^>]*>/g, '').substring(0, 150)}...
                </p>
            )}

            <div className="article-footer" onClick={(e) => e.stopPropagation()}>
                <button
                    className={`action-btn ${article.is_favorite ? 'active' : ''}`}
                    onClick={() => onToggleFavorite(article.id, article.is_favorite)}
                    title={article.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                >
                    {article.is_favorite ? '★' : '☆'}
                </button>
                <button
                    className="action-btn"
                    onClick={() => onToggleRead(article.id, article.is_read)}
                    title={article.is_read ? 'Marquer comme non lu' : 'Marquer comme lu'}
                >
                    {article.is_read ? '○' : '●'}
                </button>
            </div>
        </div>
    );
}
