import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export function ProtectedRoute() {
    const { isAuthenticated, isLoading } = useAuthStore();

    if (isLoading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-carbon">
                <div className="w-11 h-11 border-2 border-nature/20 border-t-nature rounded-full animate-spin" />
                <p className="eyebrow text-paper-muted">Chargement…</p>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    return <Outlet />;
}
