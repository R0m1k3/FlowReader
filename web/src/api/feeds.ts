import { API_BASE, handleResponse, apiFetch } from './client';

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
    list(): Promise<Feed[]> {
        return apiFetch<Feed[]>('/feeds');
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

    refresh(): Promise<{ message: string }> {
        return apiFetch('/feeds/refresh', { method: 'POST' });
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
