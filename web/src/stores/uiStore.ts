import { create } from 'zustand';

/** What the article list shows: everything, the favorites, or one feed (its id). */
export type Scope = null | 'favorites' | string;

type Dialog = null | 'add' | 'manage' | 'help';

interface UIState {
    scope: Scope;
    /** Mobile only: the "Flux" tab replaces the list. */
    tab: 'list' | 'feeds';
    focusOpen: boolean;
    searchOpen: boolean;
    /** Tablet only: the feed list slides in as a drawer. */
    drawerOpen: boolean;
    dialog: Dialog;
    setScope: (scope: Scope) => void;
    setTab: (tab: 'list' | 'feeds') => void;
    setFocusOpen: (v: boolean) => void;
    setSearchOpen: (v: boolean) => void;
    setDrawerOpen: (v: boolean) => void;
    openDialog: (d: Dialog) => void;
}

/** Navigation state of the reader app (not persisted). */
export const useUI = create<UIState>()((set) => ({
    scope: null,
    tab: 'list',
    focusOpen: false,
    searchOpen: false,
    drawerOpen: false,
    dialog: null,
    // Choosing what to read always brings the list back.
    setScope: (scope) => set({ scope, tab: 'list', drawerOpen: false }),
    setTab: (tab) => set({ tab }),
    setFocusOpen: (focusOpen) => set({ focusOpen, drawerOpen: false }),
    setSearchOpen: (searchOpen) => set({ searchOpen, drawerOpen: false }),
    setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
    openDialog: (dialog) => set({ dialog, drawerOpen: false }),
}));
