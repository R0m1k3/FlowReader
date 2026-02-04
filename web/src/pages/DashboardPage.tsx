import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { authApi } from '../api/auth';

export function DashboardPage() {
    const navigate = useNavigate();
    const { user, logout } = useAuthStore();

    const handleLogout = async () => {
        await authApi.logout();
        logout();
        navigate('/login');
    };

    return (
        <div className="dashboard">
            <header className="dashboard-header">
                <h1>FlowReader</h1>
                <div className="user-info">
                    <span>{user?.email}</span>
                    <button onClick={handleLogout} className="logout-btn">
                        Déconnexion
                    </button>
                </div>
            </header>

            <main className="dashboard-main">
                <div className="empty-state">
                    <h2>🎉 Bienvenue !</h2>
                    <p>Votre lecteur RSS est prêt.</p>
                    <p className="hint">
                        Les fonctionnalités de flux seront disponibles dans l'Epic 2.
                    </p>
                </div>
            </main>
        </div>
    );
}
