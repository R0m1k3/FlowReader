import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
    id: string;
    email: string;
    is_admin: boolean;
}

interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    /** True until the first /users/me answer when nothing is persisted. */
    isLoading: boolean;
    setUser: (user: User | null) => void;
    setLoading: (loading: boolean) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            isAuthenticated: false,
            isLoading: true,
            setUser: (user) => set({ user, isAuthenticated: !!user, isLoading: false }),
            setLoading: (isLoading) => set({ isLoading }),
            logout: () => set({ user: null, isAuthenticated: false, isLoading: false }),
        }),
        {
            name: 'auth-storage',
            partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
        }
    )
);

/** Clears every client-side copy of the user's data (logout / expired session). */
export async function clearUserData() {
    try {
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.filter((k) => k.startsWith('api') || k === 'images').map((k) => caches.delete(k)));
        }
    } catch {
        /* ignore */
    }
}
