import type { Article } from '../api/articles';

interface ReaderViewProps {
    article: Article;
    onClose: () => void;
    onToggleFavorite: (id: string, currentStatus: boolean) => void;
}

export function ReaderView({ article, onClose, onToggleFavorite }: ReaderViewProps) {
    const publishedDate = article.published_at
        ? new Date(article.published_at).toLocaleString()
        : '';

    return (
        <div className="reader-overlay" onClick={onClose}>
            <div className="reader-container" onClick={(e) => e.stopPropagation()}>
                <header className="reader-header">
                    <button className="close-btn" onClick={onClose}>✕ Fermer</button>
                    <div className="reader-actions">
                        <button
                            className={`action-btn ${article.is_favorite ? 'active' : ''}`}
                            onClick={() => onToggleFavorite(article.id, article.is_favorite)}
                        >
                            {article.is_favorite ? '★ Favori' : '☆ Favori'}
                        </button>
                        <a
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="action-btn"
                        >
                            🌐 Source
                        </a>
                    </div>
                </header>

                <article className="reader-content">
                    <div className="meta">
                        <span className="feed-name">{article.feed_title}</span>
                        <span className="date">{publishedDate}</span>
                    </div>

                    <h1 className="title">{article.title}</h1>

                    {article.author && <p className="author">Par {article.author}</p>}

                    <div
                        className="content-body"
                        dangerouslySetInnerHTML={{ __html: article.content || article.summary || '' }}
                    />
                </article>
            </div>
        </div>
    );
}
