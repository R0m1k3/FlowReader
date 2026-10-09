import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { patchArticle } from './useArticleActions';

interface LiveState {
    /** Articles fetched since the list was last loaded (not yet shown). */
    newCount: number;
    addNew: (n: number) => void;
    clearNew: () => void;
}

export const useLive = create<LiveState>((set) => ({
    newCount: 0,
    addNew: (n) => set((s) => ({ newCount: s.newCount + n })),
    clearNew: () => set({ newCount: 0 }),
}));

interface WsEvent {
    type: string;
    payload?: Record<string, unknown>;
}

/**
 * Keeps one WebSocket per session. Server events only concern the current
 * user; read/favorite/summary updates patch the cache in place, new articles
 * are announced (not auto-inserted) so the list never jumps while reading.
 */
export function useWebsocket() {
    const qc = useQueryClient();

    useEffect(() => {
        let socket: WebSocket | null = null;
        let retry = 0;
        let retryTimer: number | undefined;
        let feedsTimer: number | undefined;
        let closed = false;

        const refreshFeedsSoon = () => {
            window.clearTimeout(feedsTimer);
            feedsTimer = window.setTimeout(() => qc.invalidateQueries({ queryKey: ['feeds'] }), 1500);
        };

        const onMessage = (event: MessageEvent) => {
            let msg: WsEvent;
            try {
                msg = JSON.parse(event.data);
            } catch {
                return;
            }
            const p = msg.payload ?? {};
            switch (msg.type) {
                case 'article_updated': {
                    const { id, ...rest } = p as { id: string } & Record<string, unknown>;
                    if (id) patchArticle(qc, id, rest);
                    if ('is_read' in rest) refreshFeedsSoon();
                    break;
                }
                case 'new_articles':
                    useLive.getState().addNew(Number(p.count) || 0);
                    refreshFeedsSoon();
                    break;
                case 'articles_bulk_read':
                    qc.invalidateQueries({ queryKey: ['articles'] });
                    refreshFeedsSoon();
                    break;
                case 'refresh_done':
                    refreshFeedsSoon();
                    break;
            }
        };

        const connect = () => {
            if (closed) return;
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            socket = new WebSocket(`${protocol}//${window.location.host}/api/v1/ws`);
            socket.onopen = () => {
                retry = 0;
            };
            socket.onmessage = onMessage;
            socket.onclose = () => {
                if (closed) return;
                const delay = Math.min(30_000, 1000 * 2 ** retry++);
                retryTimer = window.setTimeout(connect, delay);
            };
            socket.onerror = () => socket?.close();
        };

        connect();

        return () => {
            closed = true;
            window.clearTimeout(retryTimer);
            window.clearTimeout(feedsTimer);
            socket?.close();
        };
    }, [qc]);
}
