import { usePrefs } from '../stores/prefsStore';

function isDarkNow() {
    return document.documentElement.classList.contains('dark');
}

/** Quick light/dark switch. Sepia and "system" live in the reader settings. */
export function ThemeToggle() {
    const theme = usePrefs((s) => s.theme);
    const setTheme = usePrefs((s) => s.setTheme);
    const isDark = theme === 'dark' || (theme === 'system' && isDarkNow());

    return (
        <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="icon-btn"
            role="switch"
            aria-checked={isDark}
            aria-label="Mode sombre"
            title={isDark ? 'Activer le mode clair' : 'Activer le mode sombre'}
        >
            <span key={isDark ? 'd' : 'l'} className="flex animate-fade-in">
                {isDark ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                )}
            </span>
        </button>
    );
}
