interface FocusEmptyStateProps {
    onBack: () => void;
}

export function FocusEmptyState({ onBack }: FocusEmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center h-full text-center space-y-8 animate-fade-in">
            <div className="relative">
                <div className="w-32 h-32 rounded-full bg-nature/10 flex items-center justify-center animate-bounce-slow">
                    <span className="text-6xl">🎉</span>
                </div>
                <div className="absolute -top-2 -right-2 w-10 h-10 bg-nature text-white rounded-full flex items-center justify-center font-bold border-4 border-carbon shadow-lg">
                    ✓
                </div>
            </div>

            <div className="space-y-2">
                <h1 className="text-4xl font-serif italic text-paper-white">C'est tout pour le moment !</h1>
                <p className="text-paper-muted uppercase tracking-widest text-xs font-bold">Vous êtes à jour sur vos lectures.</p>
            </div>

            <button
                onClick={onBack}
                className="px-8 py-3 rounded-full bg-nature text-white font-bold text-sm uppercase tracking-widest hover:bg-nature-light hover:scale-105 transition-all shadow-xl shadow-nature/20"
            >
                Retour au Dashboard
            </button>
        </div>
    );
}
