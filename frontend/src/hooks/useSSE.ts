import { useRef, useCallback } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';

interface UseSSEOptions {
  onText: (text: string, snapshot: string) => void;
  onError?: (error: string) => void;
  onComplete?: () => void;
}

export function useSSE() {
  const abortControllerRef = useRef<AbortController | null>(null);
  const isConnectedRef = useRef(false);

  const connect = useCallback((message: string, options: UseSSEOptions) => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    isConnectedRef.current = true;

    const encodedMessage = encodeURIComponent(message);
    const streamUrl = `${backendUrl}/chat/stream?message=${encodedMessage}`;

    fetchEventSource(streamUrl, {
      signal: abortController.signal,
      async onopen(response) {
        if (response.ok) {
          console.log('SSE connection opened');
        } else {
          throw new Error(`SSE connection failed: ${response.status}`);
        }
      },
      onmessage(event) {
        if (event.event === 'connected') {
          console.log('SSE Connected:', event.data);
        } else if (event.event === 'text') {
          try {
            const data = JSON.parse(event.data);
            options.onText(data.text, data.snapshot);
          } catch (error) {
            console.error('Error parsing text event:', error);
          }
        } else if (event.event === 'done') {
          console.log('SSE Done:', event.data);
          isConnectedRef.current = false;
          options.onComplete?.();
        } else if (event.event === 'error') {
          try {
            const data = JSON.parse(event.data);
            options.onError?.(data.error);
          } catch {
            options.onError?.('Stream error');
          }
          isConnectedRef.current = false;
        }
      },
      onerror(err) {
        console.error('SSE Error:', err);
        isConnectedRef.current = false;
        options.onError?.('Connection failed');
        throw err;
      },
      onclose() {
        console.log('SSE connection closed');
        isConnectedRef.current = false;
      },
    });
  }, []);

  const disconnect = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      isConnectedRef.current = false;
    }
  }, []);

  const isConnected = () => isConnectedRef.current;

  return { connect, disconnect, isConnected };
}
