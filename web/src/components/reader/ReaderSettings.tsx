import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    usePrefs,
    FONT_SIZE_MAX,
    FONT_SIZE_MIN,
    type ReaderFont,
    type ReaderWidth,
    type ThemePref,
} from '../../stores/prefsStore';
import { useIsMobile } from '../../hooks/useIsMobile';

interface ReaderSettingsProps {
    onClose: () => void;
}

const THEMES: { value: ThemePref; label: string; swatch: string }[] = [
    { value: 'light', label: 'Clair', swatch: '#FFFFFF' },
    { value: 'sepia', label: 'Sépia', swatch: '#F1E7D0' },
    { value: 'dark', label: 'Sombre', swatch: '#161B18' },
    { value: 'system', label: 'Auto', swatch: 'linear-gradient(135deg,#fff 50%,#161B18 50%)' },
];

const FONTS: { value: ReaderFont; label: string; family: string }[] = [
    { value: 'serif', label: 'Serif', family: 'var(--font-reading)' },
    { value: 'sans', label: 'Sans', family: 'var(--font-sans)' },
    { value: 'legible', label: 'Lisible', family: 'var(--font-legible)' },
];

const WIDTHS: { value: ReaderWidth; label: string }[] = [
    { value: 'narrow', label: 'Étroite' },
    { value: 'medium', label: 'Moyenne' },
    { value: 'wide', label: 'Large' },
];

const LEADINGS = [
    { value: 1.5, label: 'Serré' },
    { value: 1.65, label: 'Normal' },
    { value: 1.85, label: 'Aéré' },
];

/**
 * "Aa" panel: theme, font, size, line height and line length. A popover on
 * larger screens, a bottom sheet on phones; the text behind updates live.
 */
export function ReaderSettings({ onClose }: ReaderSettingsProps) {
    const prefs = usePrefs();
    const panelRef = useRef<HTMLDivElement>(null);
    const isMobile = useIsMobile();

    useEffect(() => {
        panelRef.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopImmediatePropagation();
                onClose();
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onClose]);

    // The sheet is portalled: the reader toolbar's backdrop blur would
    // otherwise become the containing block of its fixed position.
    const panel = (
        <>
            <div className="fixed inset-0 z-[60]" onClick={onClose} aria-hidden="true" />
            <div
                ref={panelRef}
                tabIndex={-1}
                role="dialog"
                aria-label="Réglages de lecture"
                className={
                    isMobile
                        ? 'fixed inset-x-0 bottom-0 z-[61] max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-carbon-light border-t border-line px-5 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-4 shadow-[0_-16px_40px_-16px_rgba(0,0,0,0.45)] animate-rise text-paper-white outline-none'
                        : 'absolute right-0 top-14 z-[61] w-[min(22rem,calc(100vw-2rem))] surface-card p-5 space-y-5 animate-fade-in text-paper-white outline-none'
                }
            >
                {isMobile && (
                    <>
                        <div className="mx-auto h-[5px] w-10 rounded-full bg-line" aria-hidden="true" />
                        <div className="flex items-center justify-between">
                            <h2 className="text-[22px] font-semibold">Affichage</h2>
                            <button onClick={onClose} className="min-h-11 px-4 rounded-full bg-carbon-dark text-[15px] font-semibold">Terminé</button>
                        </div>
                    </>
                )}
                <fieldset>
                    <legend className="eyebrow text-paper-muted mb-2">Thème</legend>
                    <div className="grid grid-cols-4 gap-2">
                        {THEMES.map((t) => (
                            <button
                                key={t.value}
                                onClick={() => prefs.setTheme(t.value)}
                                aria-pressed={prefs.theme === t.value}
                                className={`flex flex-col items-center gap-1.5 rounded-xl p-2 text-xs font-medium border transition-colors ${
                                    prefs.theme === t.value ? 'border-nature text-nature' : 'border-paper-muted/20 text-paper-muted hover:text-paper-white'
                                }`}
                            >
                                <span className="w-7 h-7 rounded-full border border-paper-muted/30" style={{ background: t.swatch }} />
                                {t.label}
                            </button>
                        ))}
                    </div>
                </fieldset>

                <fieldset>
                    <legend className="eyebrow text-paper-muted mb-2">Police</legend>
                    <div className="segmented w-full">
                        {FONTS.map((f) => (
                            <button
                                key={f.value}
                                className="flex-1 !text-sm"
                                style={{ fontFamily: f.family }}
                                aria-pressed={prefs.font === f.value}
                                onClick={() => prefs.setFont(f.value)}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </fieldset>

                <fieldset>
                    <legend className="eyebrow text-paper-muted mb-2">Taille du texte</legend>
                    <div className="flex items-center gap-3">
                        <button
                            className="icon-btn"
                            onClick={() => prefs.setFontSize(prefs.fontSize - 1)}
                            disabled={prefs.fontSize <= FONT_SIZE_MIN}
                            aria-label="Réduire le texte"
                        >
                            <span className="text-sm font-serif">A</span>
                        </button>
                        <input
                            type="range"
                            min={FONT_SIZE_MIN}
                            max={FONT_SIZE_MAX}
                            value={prefs.fontSize}
                            onChange={(e) => prefs.setFontSize(Number(e.target.value))}
                            className="flex-1 accent-[var(--color-nature)]"
                            aria-label="Taille du texte"
                            aria-valuetext={`${prefs.fontSize} pixels`}
                        />
                        <button
                            className="icon-btn"
                            onClick={() => prefs.setFontSize(prefs.fontSize + 1)}
                            disabled={prefs.fontSize >= FONT_SIZE_MAX}
                            aria-label="Agrandir le texte"
                        >
                            <span className="text-xl font-serif">A</span>
                        </button>
                    </div>
                </fieldset>

                <fieldset>
                    <legend className="eyebrow text-paper-muted mb-2">Interligne</legend>
                    <div className="segmented w-full">
                        {LEADINGS.map((l) => (
                            <button key={l.value} className="flex-1" aria-pressed={prefs.lineHeight === l.value} onClick={() => prefs.setLineHeight(l.value)}>
                                {l.label}
                            </button>
                        ))}
                    </div>
                </fieldset>

                <fieldset className="hidden sm:block">
                    <legend className="eyebrow text-paper-muted mb-2">Largeur de colonne</legend>
                    <div className="segmented w-full">
                        {WIDTHS.map((w) => (
                            <button key={w.value} className="flex-1" aria-pressed={prefs.width === w.value} onClick={() => prefs.setWidth(w.value)}>
                                {w.label}
                            </button>
                        ))}
                    </div>
                </fieldset>

                <button className="btn-ghost w-full" onClick={prefs.resetReader}>Réinitialiser</button>
            </div>
        </>
    );
    return isMobile ? createPortal(panel, document.body) : panel;
}
