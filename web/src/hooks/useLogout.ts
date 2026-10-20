import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../api/auth';
import { useAuthStore, clearUserData } from '../stores/authStore';

/** Ends the session, wipes cached user data and goes back to the login page. */
export function useLogout() {
    const qc = useQueryClient();
    const logoutStore = useAuthStore((s) => s.logout);
    return useMutation({
        mutationFn: () => authApi.logout(),
        onSettled: async () => {
            logoutStore();
            qc.clear();
            await clearUserData();
            window.location.href = '/login';
        },
    });
}
