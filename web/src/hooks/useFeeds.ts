import { useQuery } from '@tanstack/react-query';
import { feedsApi } from '../api/feeds';
import type { Scope } from '../stores/uiStore';

/** The feed list (shared cache with every screen that shows counters). */
export function useFeeds() {
    return useQuery({ queryKey: ['feeds'], queryFn: () => feedsApi.list() });
}

/** Total unread articles across all feeds. */
export function useTotalUnread() {
    const { data } = useFeeds();
    return (data ?? []).reduce((n, f) => n + (f.unread_count ?? 0), 0);
}

/** Human name of what the list shows. */
export function useScopeLabel(scope: Scope) {
    const { data } = useFeeds();
    if (scope === null) return 'À lire';
    if (scope === 'favorites') return 'Favoris';
    return data?.find((f) => f.id === scope)?.title ?? 'Flux';
}
