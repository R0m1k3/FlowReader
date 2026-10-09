import { create } from 'zustand';

interface UpdateState {
    /** Set when a new service worker is waiting; calling it reloads into the new version. */
    apply: (() => void) | null;
    setAvailable: (apply: () => void) => void;
    dismiss: () => void;
}

export const useUpdate = create<UpdateState>((set) => ({
    apply: null,
    setAvailable: (apply) => set({ apply }),
    dismiss: () => set({ apply: null }),
}));
