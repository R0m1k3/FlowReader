import { useState } from 'react';
import { usePrefs, type ThemePref } from '../stores/prefsStore';
import { useUI } from '../stores/uiStore';
import { useAuthStore } from '../stores/authStore';
import { useFeeds, useTotalUnread } from '../hooks/useFeeds';
import { useLogout } from '../hooks/useLogout';
import { Icon, type IconName } from '../components/Icon';
import { FeedAvatar } from '../components/FeedAvatar';
import { formatRelative } from '../lib/format';

const THEMES: { value: ThemePref; label: string }[] = [
    { value: 'light', label: 'Clair' },
    { value: 'sepia', label: 'Sépia' },
    { value: 'dark', label: 'Sombre' },
    { value: 'system', label: 'Auto' },
];

const group = 'rounded-2xl bg-carbon-light border border-line overflow-hidden divide-y divide-line';
const rowBtn = 'w-full flex items-center gap-3.5 min-h-[52px] px-3.5 text-left text-[15px] text-paper-white active:bg-carbon-dark';

/** "Flux" tab on phones: views, subscriptions and account actions. */
export function FeedsPage() {
    const { data: feeds, isPending } = useFeeds();
    const unread = useTotalUnread();
    const setScope = useUI((s) => s.setScope);
    const openDialog = useUI((s) => s.openDialog);
    const theme = usePrefs((s) => s.theme);
    const setTheme = usePrefs((s) => s.setTheme);
    const user = useAuthStore((s) => s.user);
    const logout = useLogout();
    const [filter, setFilter] = useState('');

    const shown = (feeds ?? []).filter((f) => f.title.toLowerCase().includes(filter.trim().toLowerCase()));
    const views: { label: string; icon: IconName; count?: number; onClick: () => void }[] = [
        { label: 'À lire', icon: 'inbox', count: unread, onClick: () => setScope(null) },
        { label: 'Favoris', icon: 'star', onClick: () => setScope('favorites') },
    ];

    return (
        <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-carbon pt-safe">
            <header className="px-5 pt-3 pb-3 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                    <h1 className="text-[34px] font-semibold leading-tight">Mes flux</h1>
                    <button onClick={() => openDialog('add')} className="btn-primary !pl-3 !pr-4 !text-[15px]">
                        <Icon name="plus" size={18} strokeWidth={2.2} />
                        Ajouter
                    </button>
                </div>
                {(feeds?.length ?? 0) > 6 && (
                    <div className="relative">
                        <Icon name="search" size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-paper-muted" />
                        <label htmlFor="feeds-filter" className="sr-only">Filtrer mes flux</label>
                        <input
                            id="feeds-filter"
                            type="search"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            placeholder="Filtrer mes flux"
                            className="input-field !py-2.5 !pl-10"
                        />
                    </div>
                )}
            </header>

            <div className="px-4 pb-8 flex flex-col gap-2">
                <h2 className="font-sans px-1 text-[13px] font-semibold text-paper-muted">Vues</h2>
                <ul role="list" className={group}>
                    {views.map((v) => (
                        <li key={v.label}>
                            <button onClick={v.onClick} className={rowBtn}>
                                <span aria-hidden="true" className="w-8 h-8 rounded-[9px] bg-nature-soft text-nature flex items-center justify-center">
                                    <Icon name={v.icon} size={18} strokeWidth={1.9} />
                                </span>
                                <span className="flex-1 font-semibold">{v.label}</span>
                                {!!v.count && <span className="text-sm text-paper-muted tabular-nums">{v.count}</span>}
                                <Icon name="chevronRight" size={18} strokeWidth={2} className="text-paper-muted" />
                            </button>
                        </li>
                    ))}
                </ul>

                <h2 className="font-sans mt-4 px-1 text-[13px] font-semibold text-paper-muted">
                    Abonnements{feeds ? ` · ${feeds.length}` : ''}
                </h2>
                {isPending ? (
                    <div className={`${group} h-40 animate-pulse`} aria-label="Chargement" role="status" />
                ) : shown.length === 0 ? (
                    <p className="px-1 text-sm text-paper-muted">
                        {filter ? 'Aucun flux ne correspond.' : 'Aucun flux pour l’instant : ajoutez-en un ou importez un fichier OPML.'}
                    </p>
                ) : (
                    <ul role="list" className={group}>
                        {shown.map((f) => (
                            <li key={f.id}>
                                <button onClick={() => setScope(f.id)} className={`${rowBtn} !min-h-[60px] py-2`}>
                                    <FeedAvatar id={f.id} title={f.title} size={32} />
                                    <span className="flex-1 min-w-0">
                                        <span className="block font-semibold truncate">{f.title}</span>
                                        <span className={`block text-[13px] truncate ${f.fetch_error ? 'text-danger' : 'text-paper-muted'}`}>
                                            {f.fetch_error
                                                ? 'Ne se met plus à jour'
                                                : f.last_fetched_at
                                                  ? `Mis à jour ${formatRelative(f.last_fetched_at)}`
                                                  : f.url}
                                        </span>
                                    </span>
                                    {f.fetch_error ? (
                                        <Icon name="alert" size={20} className="text-danger" label="Erreur" />
                                    ) : (f.unread_count ?? 0) > 0 ? (
                                        <span className="min-w-7 h-6 px-2 rounded-full bg-carbon-dark text-xs font-bold flex items-center justify-center tabular-nums">
                                            {f.unread_count}
                                        </span>
                                    ) : null}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                <h2 className="font-sans mt-4 px-1 text-[13px] font-semibold text-paper-muted">Thème</h2>
                <div className="segmented w-full" role="group" aria-label="Thème">
                    {THEMES.map((t) => (
                        <button key={t.value} className="flex-1" aria-pressed={theme === t.value} onClick={() => setTheme(t.value)}>
                            {t.label}
                        </button>
                    ))}
                </div>

                <ul role="list" className={`${group} mt-4`}>
                    <li><button onClick={() => openDialog('manage')} className={rowBtn}>Renommer ou supprimer des flux</button></li>
                    <li><button onClick={() => openDialog('add')} className={rowBtn}>Importer un fichier OPML</button></li>
                    <li><a href="/api/v1/feeds/export/opml" className={rowBtn}>Exporter mes flux (OPML)</a></li>
                    <li>
                        <button onClick={() => logout.mutate()} className={`${rowBtn} !text-danger font-semibold`}>
                            Se déconnecter
                        </button>
                    </li>
                </ul>
                {user && <p className="px-1 pt-1 text-xs text-paper-muted text-center">Connecté en tant que {user.email}</p>}
            </div>
        </main>
    );
}
