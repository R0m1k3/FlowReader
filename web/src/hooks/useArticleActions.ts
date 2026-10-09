import { useCallback, useMemo } from 'react';
import { useMutation, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { articlesApi, type Article, type ArticleDetail } from '../api/articles';
import type { Feed } from '../api/feeds';

type Pages = InfiniteData<Article[], unknown>;
type ListCache = Pages | Article[] | undefined;

/**
 * Applies a partial update to an article everywhere it is cached (every list
 * page and the detail entry) without refetching anything.
 */
export function patchArticle(qc: QueryClient, id: string, patch: Partial<ArticleDetail>) {
    qc.setQueriesData<ListCache>({ queryKey: ['articles'] }, (old) => {
        if (Array.isArray(old)) {
            return old.some((a) => a.id === id) ? old.map((a) => (a.id === id ? { ...a, ...patch } : a)) : old;
        }
        if (!old?.pages) return old;
        let changed = false;
        const pages = old.pages.map((page) =>
            page.map((a) => {
                if (a.id !== id) return a;
                changed = true;
                return { ...a, ...patch };
            }),
        );
        return changed ? { ...old, pages } : old;
    });
    qc.setQueryData<ArticleDetail>(['article', id], (old) => (old ? { ...old, ...patch } : old));
}

/** Finds an article in any cached list or detail entry. */
export function findCachedArticle(qc: QueryClient, id: string): Article | undefined {
    const detail = qc.getQueryData<ArticleDetail>(['article', id]);
    if (detail) return detail;
    for (const [, data] of qc.getQueriesData<ListCache>({ queryKey: ['articles'] })) {
        const pages = Array.isArray(data) ? [data] : (data?.pages ?? []);
        for (const page of pages) {
            const hit = page.find((a) => a.id === id);
            if (hit) return hit;
        }
    }
    return undefined;
}

/** Adjusts the cached unread counter of a feed (sidebar badges). */
function bumpUnread(qc: QueryClient, feedId: string, delta: number) {
    qc.setQueryData<Feed[]>(['feeds'], (old) =>
        old?.map((f) => (f.id === feedId ? { ...f, unread_count: Math.max(0, (f.unread_count ?? 0) + delta) } : f)),
    );
}

/** Read / favorite actions with optimistic cache updates and rollback on error. */
export function useArticleActions() {
    const qc = useQueryClient();

    const readMutation = useMutation({
        mutationFn: ({ id, read }: { id: string; read: boolean; feedId: string }) =>
            read ? articlesApi.markRead(id) : articlesApi.markUnread(id),
        onMutate: ({ id, read, feedId }) => {
            const prev = findCachedArticle(qc, id);
            if (prev && prev.is_read === read) return { skipped: true };
            patchArticle(qc, id, { is_read: read });
            bumpUnread(qc, feedId, read ? -1 : 1);
            return { skipped: false };
        },
        onError: (_e, { id, read, feedId }, ctx) => {
            if (ctx?.skipped) return;
            patchArticle(qc, id, { is_read: !read });
            bumpUnread(qc, feedId, read ? 1 : -1);
        },
    });

    const favoriteMutation = useMutation({
        mutationFn: ({ id }: { id: string; next: boolean }) => articlesApi.toggleFavorite(id),
        onMutate: ({ id, next }) => patchArticle(qc, id, { is_favorite: next }),
        onSuccess: (res, { id }) => {
            patchArticle(qc, id, { is_favorite: res.is_favorite });
            // The favorites list itself must gain/lose the item.
            qc.invalidateQueries({ queryKey: ['articles', { favorites: true }], refetchType: 'none' });
        },
        onError: (_e, { id, next }) => patchArticle(qc, id, { is_favorite: !next }),
    });

    const { mutate: mutateRead } = readMutation;
    const { mutate: mutateFavorite } = favoriteMutation;

    const setRead = useCallback(
        (a: Pick<Article, 'id' | 'feed_id'>, read: boolean) => mutateRead({ id: a.id, read, feedId: a.feed_id }),
        [mutateRead],
    );
    const toggleRead = useCallback(
        (a: Pick<Article, 'id' | 'feed_id' | 'is_read'>) => mutateRead({ id: a.id, read: !a.is_read, feedId: a.feed_id }),
        [mutateRead],
    );
    const toggleFavorite = useCallback(
        (a: Pick<Article, 'id' | 'is_favorite'>) => mutateFavorite({ id: a.id, next: !a.is_favorite }),
        [mutateFavorite],
    );

    return useMemo(() => ({ setRead, toggleRead, toggleFavorite }), [setRead, toggleRead, toggleFavorite]);
}
