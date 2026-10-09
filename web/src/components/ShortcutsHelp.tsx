import { useEffect, useRef } from 'react';

const GROUPS: { title: string; keys: [string, string][] }[] = [
    {
        title: 'Liste',
        keys: [
            ['j / k', 'Article suivant / précédent'],
            ['o · Entrée', 'Ouvrir l’article'],
            ['m', 'Marquer lu / non lu'],
            ['s · f', 'Favori'],
            ['v', 'Ouvrir l’original'],
            ['/', 'Rechercher'],
            ['u', 'Basculer Non lus / Tous'],
            ['r', 'Actualiser les flux'],
        ],
    },
    {
        title: 'Lecture',
        keys: [
            ['Espace', 'Défiler, puis article suivant'],
            ['j · → / k · ←', 'Suivant / précédent'],
            ['+ / -', 'Taille du texte'],
            ['Échap', 'Fermer'],
        ],
    },
];

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        ref.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' || e.key === '?') {
                e.stopImmediatePropagation();
                onClose();
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-nature-dark/50 animate-fade-in" onClick={onClose}>
            <div
                ref={ref}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby="shortcuts-title"
                className="surface-card w-full max-w-lg p-7 outline-none animate-rise"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 id="shortcuts-title" className="text-2xl font-serif italic text-nature mb-5">Raccourcis clavier</h2>
                <div className="grid sm:grid-cols-2 gap-6">
                    {GROUPS.map((g) => (
                        <section key={g.title}>
                            <h3 className="eyebrow text-paper-muted mb-3">{g.title}</h3>
                            <dl className="space-y-2 text-sm">
                                {g.keys.map(([k, label]) => (
                                    <div key={k} className="flex items-center justify-between gap-3">
                                        <dt className="text-paper-muted">{label}</dt>
                                        <dd className="kbd shrink-0">{k}</dd>
                                    </div>
                                ))}
                            </dl>
                        </section>
                    ))}
                </div>
                <button onClick={onClose} className="btn-ghost w-full mt-6">Fermer</button>
            </div>
        </div>
    );
}
