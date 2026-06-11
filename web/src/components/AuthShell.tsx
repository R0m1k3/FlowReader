import { motion } from 'framer-motion';

interface AuthShellProps {
    eyebrow: string;
    title: string;
    subtitle: string;
    children: React.ReactNode;
}

/**
 * Split-screen editorial layout shared by Login & Register.
 * Left: brand panel (hidden on mobile). Right: the form card.
 */
export function AuthShell({ eyebrow, title, subtitle, children }: AuthShellProps) {
    return (
        <div className="min-h-screen flex">
            {/* Brand panel */}
            <aside className="hidden lg:flex w-[45%] relative overflow-hidden bg-nature-dark text-white flex-col justify-between p-14">
                <div
                    className="absolute inset-0 opacity-30 pointer-events-none"
                    style={{
                        backgroundImage:
                            'radial-gradient(circle at 20% 20%, rgba(52,210,123,0.35), transparent 45%), radial-gradient(circle at 80% 80%, rgba(180,91,62,0.25), transparent 45%)',
                    }}
                />
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    className="relative z-10"
                >
                    <span className="text-nature-light text-5xl font-serif italic">F.</span>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, delay: 0.1 }}
                    className="relative z-10 space-y-6"
                >
                    <h2 className="text-5xl font-serif italic leading-[1.1] text-balance">
                        Le calme dans le chaos de l'information.
                    </h2>
                    <p className="text-white/70 font-reading text-lg max-w-sm leading-relaxed">
                        Un agrégateur RSS minimaliste pour reprendre le contrôle de votre veille.
                    </p>
                </motion.div>

                <p className="relative z-10 text-white/40 text-[10px] uppercase tracking-[0.4em] font-bold">
                    FlowReader · Édition 2026
                </p>
            </aside>

            {/* Form side */}
            <main className="flex-1 flex items-center justify-center p-6">
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="w-full max-w-md"
                >
                    <div className="lg:hidden text-center mb-8">
                        <span className="text-nature text-4xl font-serif italic">FlowReader</span>
                    </div>

                    <div className="surface-card p-8 sm:p-10">
                        <header className="mb-8">
                            <p className="eyebrow mb-2">{eyebrow}</p>
                            <h1 className="text-4xl font-serif italic text-paper-white mb-2">{title}</h1>
                            <p className="text-paper-muted text-sm">{subtitle}</p>
                        </header>
                        {children}
                    </div>
                </motion.div>
            </main>
        </div>
    );
}
