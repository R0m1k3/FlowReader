import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '../api/auth';
import { ApiError } from '../api/client';

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
            if (err instanceof ApiError) {
                setError(err.message);
            } else {
                setError('L\'inscription a échoué. Veuillez réessayer.');
            }
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Les mots de passe ne correspondent pas');
            return;
        }

        registerMutation.mutate({ email, password });
    };

    return (
        <div className="min-h-screen bg-carbon flex items-center justify-center p-6">
            <div className="w-full max-w-md bg-carbon-light p-10 rounded-xl shadow-2xl border border-carbon-dark/50 animate-in fade-in zoom-in duration-500">
                <div className="text-center mb-10">
                    <h1 className="text-gold text-4xl font-serif mb-2 italic tracking-tight">FlowReader</h1>
                    <p className="text-paper-muted text-[10px] uppercase tracking-[0.3em] font-bold">Rejoindre l'Édition</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-xs p-3 rounded-md animate-shake">
                            {error}
                        </div>
                    )}

                    <div className="space-y-2">
                        <label htmlFor="email" className="block text-paper-muted text-[10px] uppercase tracking-widest font-bold">
                            Email
                        </label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-carbon border border-carbon-dark text-paper-white px-4 py-3 rounded-md focus:border-gold focus:ring-1 focus:ring-gold outline-none transition-all placeholder:text-carbon-light"
                            placeholder="vous@exemple.com"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="password" title='password' className="block text-paper-muted text-[10px] uppercase tracking-widest font-bold">
                            Mot de passe
                        </label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-carbon border border-carbon-dark text-paper-white px-4 py-3 rounded-md focus:border-gold focus:ring-1 focus:ring-gold outline-none transition-all placeholder:text-carbon-light"
                            placeholder="••••••••"
                            required
                            minLength={8}
                        />
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="confirmPassword" title='confirm password' className="block text-paper-muted text-[10px] uppercase tracking-widest font-bold">
                            Confirmer le mot de passe
                        </label>
                        <input
                            id="confirmPassword"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full bg-carbon border border-carbon-dark text-paper-white px-4 py-3 rounded-md focus:border-gold focus:ring-1 focus:ring-gold outline-none transition-all placeholder:text-carbon-light"
                            placeholder="••••••••"
                            required
                            minLength={8}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={registerMutation.isPending}
                        className="w-full btn-primary py-4 text-xs uppercase tracking-[0.2em] font-bold mt-4 disabled:opacity-50 disabled:cursor-wait"
                    >
                        {registerMutation.isPending ? 'Création...' : 'Créer mon compte'}
                    </button>
                </form>

                <p className="mt-8 text-center text-paper-muted text-xs">
                    Déjà membre ?{' '}
                    <button
                        className="text-gold hover:underline font-bold tracking-wide"
                        onClick={() => navigate('/login')}
                    >
                        Se connecter
                    </button>
                </p>
            </div>
        </div>
    );
}
