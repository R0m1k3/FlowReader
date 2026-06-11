import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { feedsApi } from '../api/feeds';
import { AddFeedModal } from './AddFeedModal';
import { ThemeToggle } from './ThemeToggle';

interface MobileTopBarProps {
    onSelectFeed: (feedId: string | null) => void;
    selectedFeedId: string | null;
    onEnterFocus: () => void;
}

/** Compact navigation for small screens (the full Sidebar is hidden on mobile). */
export function MobileTopBar({ onSelectFeed, selectedFeedId, onEnterFocus }: MobileTopBarProps) {
    const [isAddOpen, setIsAddOpen] = useState(false);
    const { data: feeds } = useQuery({ queryKey: ['feeds'], queryFn: () => feedsApi.list() });

    return (
        <>
            <header className="md:hidden sticky top-0 z-30 bg-carbon-light/85 backdrop-blur-xl border-b border-paper-muted/12 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                    <button onClick={() => onSelectFeed(null)} className="text-nature text-xl font-serif italic shrink-0">
                        FlowReader
                    </button>
                    <div className="flex items-center gap-2">
                        <button onClick={onEnterFocus} className="icon-btn" title="Mode Focus" aria-label="Mode Focus">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </button>
                        <ThemeToggle />
                        <button onClick={() => setIsAddOpen(true)} className="icon-btn" title="Ajouter un flux" aria-label="Ajouter un flux">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Feed selector chips */}
                <div className="flex gap-2 mt-3 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
                    {[
                        { id: null as string | null, label: 'Tous' },
                        { id: 'favorites' as string | null, label: 'Favoris' },
                        ...(feeds ?? []).map((f) => ({ id: f.id as string | null, label: f.title })),
                    ].map((item) => (
                        <button
                            key={item.id ?? 'all'}
                            onClick={() => onSelectFeed(item.id)}
                            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                                selectedFeedId === item.id
                                    ? 'bg-nature text-white'
                                    : 'bg-nature/8 text-paper-muted hover:text-nature'
                            }`}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            </header>

            <AddFeedModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} />
        </>
    );
}
