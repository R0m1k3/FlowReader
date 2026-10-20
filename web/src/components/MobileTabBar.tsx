import { useUI } from '../stores/uiStore';
import { useTotalUnread } from '../hooks/useFeeds';
import { Icon, type IconName } from './Icon';

/** Bottom tab bar (phones): everything within thumb reach. */
export function MobileTabBar() {
    const scope = useUI((s) => s.scope);
    const tab = useUI((s) => s.tab);
    const setScope = useUI((s) => s.setScope);
    const setTab = useUI((s) => s.setTab);
    const setFocusOpen = useUI((s) => s.setFocusOpen);
    const unread = useTotalUnread();

    const tabs: { id: string; label: string; icon: IconName; current: boolean; onClick: () => void; badge?: string }[] = [
        {
            id: 'list',
            label: 'À lire',
            icon: 'inbox',
            current: tab === 'list' && scope !== 'favorites',
            onClick: () => setScope(scope === 'favorites' ? null : scope),
            badge: unread > 0 ? (unread > 99 ? '99+' : String(unread)) : undefined,
        },
        { id: 'focus', label: 'Focus', icon: 'bolt', current: false, onClick: () => setFocusOpen(true) },
        { id: 'fav', label: 'Favoris', icon: 'star', current: tab === 'list' && scope === 'favorites', onClick: () => setScope('favorites') },
        { id: 'feeds', label: 'Flux', icon: 'rss', current: tab === 'feeds', onClick: () => setTab('feeds') },
    ];

    return (
        <nav aria-label="Navigation" className="md:hidden shrink-0 flex px-2 pt-1.5 pb-safe bg-carbon-light border-t border-line">
            {tabs.map((t) => (
                <button
                    key={t.id}
                    onClick={t.onClick}
                    aria-current={t.current ? 'page' : undefined}
                    className={`flex-1 min-h-[50px] flex flex-col items-center gap-0.5 text-[11px] font-semibold transition-colors ${
                        t.current ? 'text-nature' : 'text-paper-muted'
                    }`}
                >
                    <span className="relative flex">
                        <Icon name={t.icon} size={26} strokeWidth={t.current ? 1.9 : 1.8} />
                        {t.badge && (
                            <span className="absolute -top-1 left-4 min-w-[18px] h-[18px] px-1 rounded-full bg-nature text-on-nature text-[10px] font-bold flex items-center justify-center border-2 border-carbon-light tabular-nums">
                                <span className="sr-only">, </span>
                                {t.badge}
                                <span className="sr-only"> non lus</span>
                            </span>
                        )}
                    </span>
                    {t.label}
                </button>
            ))}
        </nav>
    );
}
