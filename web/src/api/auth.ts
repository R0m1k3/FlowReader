const API_BASE = '/api/v1';

interface RegisterRequest {
    email: string;
    password: string;
}

interface LoginRequest {
    email: string;
    password: string;
}

interface User {
    id: string;
    email: string;
    is_admin: boolean;
}

interface LoginResponse {
    token: string;
    expires_at: string;
    user: User;
}

interface RegisterResponse {
    id: string;
    email: string;
    created_at: string;
}

class ApiError extends Error {
    constructor(public status: number, message: string) {
        super(message);
        this.name = 'ApiError';
    }
}

async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new ApiError(response.status, error.error || 'Request failed');
    }
    return response.json();
}

export const authApi = {
    async register(data: RegisterRequest): Promise<RegisterResponse> {
        const response = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data),
        });
        return handleResponse<RegisterResponse>(response);
    },

    async login(data: LoginRequest): Promise<LoginResponse> {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data),
        });
        return handleResponse<LoginResponse>(response);
    },

    async logout(): Promise<void> {
        await fetch(`${API_BASE}/auth/logout`, {
            method: 'POST',
            credentials: 'include',
        });
    },

    async getMe(): Promise<User> {
        const response = await fetch(`${API_BASE}/users/me`, {
            credentials: 'include',
        });
        return handleResponse<User>(response);
    },
};

export { ApiError };
export type { User, LoginResponse, RegisterResponse };
