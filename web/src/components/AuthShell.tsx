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
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    className="relative z-10"
                >
                    <span aria-hidden="true" className="w-14 h-14 rounded-2xl bg-nature text-on-nature flex items-center justify-center font-serif font-bold text-[34px] leading-none">F</span>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, delay: 0.1 }}
                    className="relative z-10 space-y-6"
                >
                    <h2 className="text-5xl font-semibold leading-[1.08] tracking-[-0.02em] text-balance text-white">
                        Le calme dans le chaos de l'information.
                    </h2>
                    <p className="text-white/70 font-reading text-lg max-w-sm leading-relaxed">
                        Un agrégateur RSS minimaliste pour reprendre le contrôle de votre veille.
                    </p>
                </motion.div>

                <p className="relative z-10 text-white/50 text-xs">
                    FlowReader · Édition 2026
                </p>
            </aside>

            {/* Form side */}
            <main className="flex-1 flex items-start sm:items-center justify-center px-6 pt-[max(2.5rem,env(safe-area-inset-top))] pb-10 sm:p-6">
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="w-full max-w-md"
                >
                    <div className="lg:hidden mb-6">
                        <span aria-hidden="true" className="inline-flex w-[52px] h-[52px] rounded-[15px] bg-nature text-on-nature items-center justify-center font-serif font-bold text-[31px] leading-none">F</span>
                    </div>

                    <div>
                        <header className="mb-8">
                            <p className="eyebrow mb-2">{eyebrow}</p>
                            <h1 className="text-[34px] font-semibold leading-[1.08] tracking-[-0.02em] text-paper-white mb-2">{title}</h1>
                            <p className="text-paper-muted text-sm">{subtitle}</p>
                        </header>
                        {children}
                    </div>
                </motion.div>
            </main>
        </div>
    );
}
