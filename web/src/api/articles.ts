import { API_BASE, handleResponse } from './client';

export class ApiError extends Error {
    public status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
        this.name = 'ApiError';
    }
}

export interface Article {
    id: string;
    feed_id: string;
    guid: string;
    title: string;
    url?: string;
    content?: string;
    summary?: string;
    author?: string;
    image_url?: string;
    published_at?: string;
    is_read: boolean;
    is_favorite: boolean;
    read_at?: string;
    created_at: string;
    feed_title?: string;
}

export interface ListArticlesOptions {
    limit?: number;
    offset?: number;
    unread?: boolean;
    favorite?: boolean;
    feed_id?: string;
}

export const articlesApi = {
    async list(options: ListArticlesOptions = {}): Promise<Article[]> {
        const params = new URLSearchParams();
        if (options.limit) params.append('limit', options.limit.toString());
        if (options.offset) params.append('offset', options.offset.toString());
        if (options.unread) params.append('unread', 'true');
        if (options.favorite) params.append('favorite', 'true');

        let url = `${API_BASE}/articles`;
        if (options.favorite) {
            url = `${API_BASE}/articles/favorites`;
        } else if (options.feed_id) {
            url = `${API_BASE}/feeds/${options.feed_id}/articles`;
        }

        if (params.toString()) {
            url += `?${params.toString()}`;
        }

        const response = await fetch(url, {
            credentials: 'include',
        });
        return handleResponse<Article[]>(response);
    },

    async get(id: string): Promise<Article> {
        const response = await fetch(`${API_BASE}/articles/${id}`, {
            credentials: 'include',
        });
        return handleResponse<Article>(response);
    },

    async markRead(id: string): Promise<{ is_read: boolean }> {
        const response = await fetch(`${API_BASE}/articles/${id}/read`, {
            method: 'POST',
            credentials: 'include',
        });
        return handleResponse(response);
    },

    async markUnread(id: string): Promise<{ is_read: boolean }> {
        const response = await fetch(`${API_BASE}/articles/${id}/read`, {
            method: 'DELETE',
            credentials: 'include',
        });
        return handleResponse(response);
    },

    async toggleFavorite(id: string): Promise<{ is_favorite: boolean }> {
        const response = await fetch(`${API_BASE}/articles/${id}/favorite`, {
            method: 'POST',
            credentials: 'include',
        });
        return handleResponse(response);
    },

    async markAllRead(feedId: string): Promise<{ message: string }> {
        const response = await fetch(`${API_BASE}/feeds/${feedId}/read-all`, {
            method: 'POST',
            credentials: 'include',
        });
        return handleResponse(response);
    },

    async markAllReadGlobal(): Promise<{ message: string }> {
        const response = await fetch(`${API_BASE}/articles/read-all`, {
            method: 'POST',
            credentials: 'include',
        });
        return handleResponse(response);
    },

    async search(query: string, limit: number = 50, offset: number = 0): Promise<Article[]> {
        const params = new URLSearchParams();
        params.append('q', query);
        params.append('limit', limit.toString());
        params.append('offset', offset.toString());

        const response = await fetch(`${API_BASE}/articles/search?${params.toString()}`, {
            credentials: 'include',
        });
        return handleResponse<Article[]>(response);
    },
};
