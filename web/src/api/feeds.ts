import { API_BASE, handleResponse } from './client';

export interface Feed {
    id: string;
    user_id: string;
    url: string;
    title: string;
    description?: string;
    site_url?: string;
    image_url?: string;
    last_fetched_at?: string;
    fetch_error?: string;
    created_at: string;
    updated_at: string;
    unread_count?: number;
}

export interface AddFeedRequest {
    url: string;
}

export const feedsApi = {
    async list(): Promise<Feed[]> {
        const response = await fetch(`${API_BASE}/feeds`, {
            credentials: 'include',
        });
        return handleResponse<Feed[]>(response);
    },

    async add(data: AddFeedRequest): Promise<Feed> {
        const response = await fetch(`${API_BASE}/feeds`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data),
        });
        return handleResponse<Feed>(response);
    },

    async get(id: string): Promise<Feed> {
        const response = await fetch(`${API_BASE}/feeds/${id}`, {
            credentials: 'include',
        });
        return handleResponse<Feed>(response);
    },

    async update(id: string, title: string): Promise<Feed> {
        const response = await fetch(`${API_BASE}/feeds/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ title }),
        });
        return handleResponse<Feed>(response);
    },

    async delete(id: string): Promise<void> {
        const response = await fetch(`${API_BASE}/feeds/${id}`, {
            method: 'DELETE',
            credentials: 'include',
        });
        await handleResponse(response);
    },

    async refresh(): Promise<{ message: string }> {
        const response = await fetch(`${API_BASE}/feeds/refresh`, {
            method: 'POST',
            credentials: 'include',
        });
        return handleResponse(response);
    },

    async importOPML(file: File): Promise<{ imported: number; skipped: number; errors?: string[] }> {
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch(`${API_BASE}/feeds/import/opml`, {
            method: 'POST',
            credentials: 'include',
            body: formData,
        });
        return handleResponse(response);
    },
};
