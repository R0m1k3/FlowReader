import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export function ProtectedRoute() {
    const { isAuthenticated, isLoading } = useAuthStore();

    // A persisted session renders immediately; /users/me revalidates in the
    // background and any 401 logs the user out.
    if (isAuthenticated) return <Outlet />;

    if (isLoading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-carbon" role="status">
                <div className="w-11 h-11 border-2 border-nature/20 border-t-nature rounded-full animate-spin" />
                <p className="eyebrow text-paper-muted">Chargement…</p>
            </div>
        );
    }

    return <Navigate to="/login" replace />;
}
