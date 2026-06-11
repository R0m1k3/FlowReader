import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { authApi } from '../api/auth';
import { ApiError } from '../api/client';
import { AuthShell } from '../components/AuthShell';

export function RegisterPage() {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');

    const registerMutation = useMutation({
        mutationFn: authApi.register,
        onSuccess: () => {
            navigate('/login', { state: { message: 'Compte créé ! Vous pouvez vous connecter.' } });
        },
        onError: (err: Error) => {
            setError(err instanceof ApiError ? err.message : "L'inscription a échoué. Veuillez réessayer.");
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (password !== confirmPassword) {
            setError('Les mots de passe ne correspondent pas.');
            return;
        }
        registerMutation.mutate({ email, password });
    };

    return (
        <AuthShell eyebrow="Rejoindre l'édition" title="Créez votre journal" subtitle="Une veille calme, intelligente et sans bruit.">
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
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
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="input-field"
                        placeholder="Au moins 8 caractères"
                        required
                        minLength={8}
                    />
                </div>

                <div className="space-y-2">
                    <label htmlFor="confirmPassword" className="block eyebrow text-paper-muted">Confirmer le mot de passe</label>
                    <input
                        id="confirmPassword"
                        type="password"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="input-field"
                        placeholder="••••••••"
                        required
                        minLength={8}
                    />
                </div>

                <motion.button
                    type="submit"
                    disabled={registerMutation.isPending}
                    whileTap={{ scale: 0.98 }}
                    className="btn-primary w-full py-4 text-xs"
                >
                    {registerMutation.isPending ? 'Création…' : 'Créer mon compte'}
                </motion.button>
            </form>

            <p className="mt-8 text-center text-paper-muted text-sm">
                Déjà membre ?{' '}
                <button onClick={() => navigate('/login')} className="text-nature font-bold hover:underline underline-offset-4">
                    Se connecter
                </button>
            </p>
        </AuthShell>
    );
}
