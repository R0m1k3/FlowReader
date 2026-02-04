import { API_BASE, handleResponse } from './client';

export interface User {
    id: string;
    email: string;
    is_admin: boolean;
}

export interface RegisterRequest {
    email: string;
    password: string;
}

export interface LoginRequest {
    email: string;
    password: string;
}

export interface LoginResponse {
    token: string;
    expires_at: string;
    user: User;
}

export interface RegisterResponse {
    id: string;
    email: string;
    created_at: string;
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
