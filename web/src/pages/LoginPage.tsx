import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { authApi } from '../api/auth';
import { ApiError } from '../api/client';
import { useAuthStore } from '../stores/authStore';
import { AuthShell } from '../components/AuthShell';

export function LoginPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const setUser = useAuthStore((state) => state.setUser);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const flashMessage = (location.state as { message?: string } | null)?.message;

    const loginMutation = useMutation({
        mutationFn: authApi.login,
        onSuccess: (data) => {
            setUser(data.user);
            navigate('/');
        },
        onError: (err: Error) => {
            setError(err instanceof ApiError ? err.message : 'Échec de la connexion. Veuillez réessayer.');
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        loginMutation.mutate({ email, password });
    };

    return (
        <AuthShell eyebrow="Magazine personnel" title="Bon retour" subtitle="Reprenez votre veille là où vous l'avez laissée.">
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                {flashMessage && !error && (
                    <p className="text-nature text-xs bg-nature/10 border border-nature/20 rounded-xl p-3" role="status">
                        {flashMessage}
                    </p>
                )}
                {error && (
                    <p className="text-danger text-xs bg-danger/10 border border-danger/30 rounded-xl p-3 animate-shake" role="alert">
                        {error}
                    </p>
                )}

                <div className="space-y-2">
                    <label htmlFor="email" className="block eyebrow text-paper-muted">Email</label>
                    <input
                        id="email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="input-field"
                        placeholder="vous@exemple.com"
                        required
                        autoFocus
                    />
                </div>

                <div className="space-y-2">
                    <label htmlFor="password" className="block eyebrow text-paper-muted">Mot de passe</label>
                    <input
                        id="password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="input-field"
                        placeholder="••••••••"
                        required
                    />
                </div>

                <motion.button
                    type="submit"
                    disabled={loginMutation.isPending}
                    whileTap={{ scale: 0.98 }}
                    className="btn-primary w-full py-4 text-xs"
                >
                    {loginMutation.isPending ? 'Authentification…' : 'Continuer'}
                </motion.button>
            </form>

            <p className="mt-8 text-center text-paper-muted text-sm">
                Nouveau chez FlowReader ?{' '}
                <button onClick={() => navigate('/register')} className="text-nature font-bold hover:underline underline-offset-4">
                    Créer un compte
                </button>
            </p>
        </AuthShell>
    );
}
