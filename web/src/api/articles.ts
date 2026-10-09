import { apiFetch } from './client';

export { ApiError } from './client';

/** List item: light payload (no HTML content). */
export interface Article {
    id: string;
    feed_id: string;
    title: string;
    url?: string;
    excerpt?: string;
    ai_summary?: string;
    author?: string;
    image_url?: string;
    published_at?: string;
    sort_at: string;
    is_read: boolean;
    is_favorite: boolean;
    read_at?: string;
    created_at: string;
    word_count: number;
    reading_time: number;
    feed_title?: string;
}

/** Full article returned by GET /articles/{id}. HTML is sanitized server-side. */
export interface ArticleDetail extends Article {
    content?: string;
    summary?: string;
}

export interface ListArticlesOptions {
    limit?: number;
    cursor?: string;
    unread?: boolean;
    favorites?: boolean;
    feedId?: string | null;
}

/** Keyset cursor for the page following `last`. */
export function cursorAfter(last: Article): string {
    return `${last.sort_at},${last.id}`;
}

export const articlesApi = {
    list(options: ListArticlesOptions = {}): Promise<Article[]> {
        const params = new URLSearchParams();
        if (options.limit) params.set('limit', String(options.limit));
        if (options.cursor) params.set('cursor', options.cursor);
        if (options.unread) params.set('unread', 'true');

        let path = '/articles';
        if (options.favorites) path = '/articles/favorites';
        else if (options.feedId) path = `/feeds/${options.feedId}/articles`;

        const qs = params.toString();
        return apiFetch<Article[]>(qs ? `${path}?${qs}` : path);
    },

    get(id: string): Promise<ArticleDetail> {
        return apiFetch<ArticleDetail>(`/articles/${id}`);
    },

    markRead(id: string): Promise<{ is_read: boolean }> {
        return apiFetch(`/articles/${id}/read`, { method: 'POST' });
    },

    markUnread(id: string): Promise<{ is_read: boolean }> {
        return apiFetch(`/articles/${id}/read`, { method: 'DELETE' });
    },

    toggleFavorite(id: string): Promise<{ is_favorite: boolean }> {
        return apiFetch(`/articles/${id}/favorite`, { method: 'POST' });
    },

    markAllRead(feedId: string): Promise<{ message: string; count: number }> {
        return apiFetch(`/feeds/${feedId}/read-all`, { method: 'POST' });
    },

    markAllReadGlobal(): Promise<{ message: string; count: number }> {
        return apiFetch('/articles/read-all', { method: 'POST' });
    },

    search(query: string, limit = 30, offset = 0): Promise<Article[]> {
        const params = new URLSearchParams({ q: query, limit: String(limit), offset: String(offset) });
        return apiFetch<Article[]>(`/articles/search?${params}`);
    },

    summarize(id: string): Promise<{ summary: string }> {
        return apiFetch(`/articles/${id}/summarize`, { method: 'POST' });
    },
};
