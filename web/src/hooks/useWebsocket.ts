import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useWebsocket() {
    const queryClient = useQueryClient();
    const socketRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/api/v1/ws`;

        const connect = () => {
            const socket = new WebSocket(wsUrl);
            socketRef.current = socket;

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('WS Message:', data);

                    if (data.type === 'new_articles' || data.type === 'article_updated') {
                        // Invalidate articles and feeds query to trigger refetch
                        queryClient.invalidateQueries({ queryKey: ['articles'] });
                        queryClient.invalidateQueries({ queryKey: ['feeds'] });
                    }
                } catch (err) {
                    console.error('Failed to parse WS message', err);
                }
            };

            socket.onclose = () => {
                console.log('WS connection closed, retrying in 5s...');
                setTimeout(connect, 5000);
            };

            socket.onerror = (err) => {
                console.error('WS error:', err);
                socket.close();
            };
        };

        connect();

        return () => {
            if (socketRef.current) {
                socketRef.current.close();
            }
        };
    }, [queryClient]);
}
