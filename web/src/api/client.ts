export const API_BASE = '/api/v1';

export class ApiError extends Error {
    public status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
        this.name = 'ApiError';
    }
}

type UnauthorizedListener = () => void;
let onUnauthorized: UnauthorizedListener | null = null;

/** Registers the handler run when an authenticated call gets a 401 (session expired). */
export function setUnauthorizedHandler(fn: UnauthorizedListener) {
    onUnauthorized = fn;
}

export async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        if (response.status === 401 && !response.url.includes('/auth/')) {
            onUnauthorized?.();
        }
        throw new ApiError(response.status, error.error || 'Request failed');
    }
    return response.json();
}

/** fetch() with cookies and JSON handling. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...init });
    return handleResponse<T>(response);
}
