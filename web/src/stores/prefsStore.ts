import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePref = 'system' | 'light' | 'sepia' | 'dark';
export type ReaderFont = 'serif' | 'sans' | 'legible';
export type ReaderWidth = 'narrow' | 'medium' | 'wide';
/** List rows with a thumbnail, or a magazine grid of cards. */
export type ListView = 'list' | 'magazine';

interface PrefsState {
    theme: ThemePref;
    /** Article body font size in px. */
    fontSize: number;
    lineHeight: number;
    width: ReaderWidth;
    font: ReaderFont;
    /** Dashboard filter: show only unread articles. */
    unreadOnly: boolean;
    view: ListView;
    /** AI summary block expanded at the top of the reader. */
    summaryOpen: boolean;
    setTheme: (t: ThemePref) => void;
    setFontSize: (n: number) => void;
    setLineHeight: (n: number) => void;
    setWidth: (w: ReaderWidth) => void;
    setFont: (f: ReaderFont) => void;
    setUnreadOnly: (v: boolean) => void;
    setView: (v: ListView) => void;
    setSummaryOpen: (v: boolean) => void;
    resetReader: () => void;
}

// Research-backed defaults: ~65ch measure, 19px body, 1.65 line-height.
const READER_DEFAULTS = { fontSize: 19, lineHeight: 1.65, width: 'medium' as ReaderWidth, font: 'serif' as ReaderFont };

export const FONT_SIZE_MIN = 15;
export const FONT_SIZE_MAX = 26;

const THEME_COLORS: Record<Exclude<ThemePref, 'system'>, string> = {
    light: '#F6F4EE',
    sepia: '#F1E7D0',
    dark: '#0F1311',
};

function resolveTheme(pref: ThemePref): Exclude<ThemePref, 'system'> {
    if (pref !== 'system') return pref;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Applies the theme classes on <html>; mirrored by public/theme-init.js to avoid a flash on load. */
export function applyTheme(pref: ThemePref) {
    const theme = resolveTheme(pref);
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('sepia', theme === 'sepia');
    root.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
    try {
        if (pref === 'system') localStorage.removeItem('theme');
        else localStorage.setItem('theme', pref);
    } catch {
        /* storage unavailable (private mode) */
    }
}

export const usePrefs = create<PrefsState>()(
    persist(
        (set) => ({
            theme: 'system',
            ...READER_DEFAULTS,
            unreadOnly: true,
            view: 'list',
            summaryOpen: true,
            setTheme: (theme) => {
                applyTheme(theme);
                set({ theme });
            },
            setFontSize: (fontSize) => set({ fontSize: Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, fontSize)) }),
            setLineHeight: (lineHeight) => set({ lineHeight }),
            setWidth: (width) => set({ width }),
            setFont: (font) => set({ font }),
            setUnreadOnly: (unreadOnly) => set({ unreadOnly }),
            setView: (view) => set({ view }),
            setSummaryOpen: (summaryOpen) => set({ summaryOpen }),
            resetReader: () => set(READER_DEFAULTS),
        }),
        {
            name: 'flowreader-prefs',
            onRehydrateStorage: () => (state) => {
                if (state) applyTheme(state.theme);
            },
        },
    ),
);

// Follow OS changes while in "system" mode.
if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (usePrefs.getState().theme === 'system') applyTheme('system');
    });
}
