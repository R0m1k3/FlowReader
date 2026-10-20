import { Icon } from '../Icon';

interface FocusEmptyStateProps {
    onBack: () => void;
}

export function FocusEmptyState({ onBack }: FocusEmptyStateProps) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-5 px-6 animate-rise">
            <span aria-hidden="true" className="w-20 h-20 rounded-full bg-nature-soft text-nature flex items-center justify-center">
                <Icon name="check" size={36} strokeWidth={2.2} />
            </span>
            <div className="space-y-1.5">
                <h1 className="text-3xl font-semibold text-paper-white">Tout est trié</h1>
                <p className="text-paper-muted">Vous êtes à jour sur vos lectures.</p>
            </div>
            <button onClick={onBack} className="btn-primary !px-6" autoFocus>Retour à la liste</button>
        </div>
    );
}
