import { loadStrokePages } from './loadStrokePages.js';

// One owner for both initial restoration and later tail checks. Requests made
// during a run are coalesced into one subsequent pass from the painted cursor.
export function createPersistedStrokeLoader({ httpUrl, signal, onPage,
    onRunStart, onRunComplete, onRunError, fetchImpl }) {
    let cursor = null;
    let running = null;
    const pending = new Set();

    const request = kind => {
        if (signal?.aborted) return Promise.resolve();
        pending.add(kind);
        if (running) return running;
        running = (async () => {
            try {
                while (pending.size && !signal?.aborted) {
                    const nextKind = pending.has('initial') ? 'initial' :
                        pending.has('catchup') ? 'catchup' : 'refresh';
                    pending.clear();
                    onRunStart?.(nextKind);
                    const startedAt = performance.now();
                    try {
                        const result = await loadStrokePages({ httpUrl, after: cursor,
                            signal, fetchImpl, onPage: page => {
                                onPage(page, nextKind);
                                // The callback has validated and painted this page.
                                cursor = page.cursor;
                            },
                        });
                        if (signal?.aborted) return;
                        onRunComplete?.(nextKind, { ...result,
                            durationMs: Math.round(performance.now() - startedAt) });
                    } catch (error) {
                        if (signal?.aborted) return;
                        pending.clear();
                        onRunError?.(nextKind, error);
                        throw error;
                    }
                }
            } finally {
                running = null;
            }
        })();
        return running;
    };

    return { request, getCursor: () => cursor };
}
