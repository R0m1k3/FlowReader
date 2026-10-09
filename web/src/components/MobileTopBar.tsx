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
            <header className="md:hidden sticky top-0 z-30 bg-carbon-light/95 border-b border-paper-muted/12 px-4 py-2.5" style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}>
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
                <nav className="flex gap-2 mt-2.5 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar" aria-label="Flux">
                    {[
                        { id: null as string | null, label: 'Tous', unread: 0 },
                        { id: 'favorites' as string | null, label: 'Favoris', unread: 0 },
                        ...(feeds ?? []).map((f) => ({ id: f.id as string | null, label: f.title, unread: f.unread_count ?? 0 })),
                    ].map((item) => (
                        <button
                            key={item.id ?? 'all'}
                            onClick={() => onSelectFeed(item.id)}
                            aria-current={selectedFeedId === item.id ? 'page' : undefined}
                            className={`shrink-0 min-h-10 px-3.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                                selectedFeedId === item.id
                                    ? 'bg-nature text-on-nature'
                                    : 'bg-nature/10 text-paper-muted hover:text-nature'
                            }`}
                        >
                            {item.label}
                            {item.unread ? <span className="ml-1.5 opacity-80">{item.unread}</span> : null}
                        </button>
                    ))}
                </nav>
            </header>

            {isAddOpen && <AddFeedModal onClose={() => setIsAddOpen(false)} />}
        </>
    );
}
