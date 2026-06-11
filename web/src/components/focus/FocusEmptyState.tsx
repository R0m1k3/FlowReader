import { motion } from 'framer-motion';

interface FocusEmptyStateProps {
    onBack: () => void;
}

export function FocusEmptyState({ onBack }: FocusEmptyStateProps) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center justify-center h-full text-center space-y-8 px-6"
        >
            <div className="relative">
                <div className="w-28 h-28 rounded-full bg-nature/10 flex items-center justify-center animate-bounce-slow">
                    <span className="text-5xl">🌿</span>
                </div>
                <div className="absolute -top-1 -right-1 w-9 h-9 bg-nature text-white rounded-full flex items-center justify-center font-bold border-4 border-carbon">
                    ✓
                </div>
            </div>

            <div className="space-y-2">
                <h1 className="text-4xl font-serif italic text-paper-white">C'est tout pour le moment !</h1>
                <p className="eyebrow text-paper-muted">Vous êtes à jour sur vos lectures.</p>
            </div>

            <button onClick={onBack} className="btn-primary py-3 px-8">Retour au tableau de bord</button>
        </motion.div>
    );
}
