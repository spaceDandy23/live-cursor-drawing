const metrics = {
    chunksFetched: 0,
    strokesRestored: 0,
    firstChunkMs: null,
    totalRestorationMs: 0,
    approximateResponseBytes: 0,
    catchupRuns: 0,
    catchupChunks: 0,
    catchupStrokesRestored: 0,
    catchupDurationMs: 0,
    catchupFailures: 0,
};

if (import.meta.env?.DEV && typeof window !== 'undefined') {
    window.__savedCanvasMetrics = metrics;
}

export function recordRestorationChunk(strokes, bytes, startedAt) {
    if (!import.meta.env?.DEV) return;
    metrics.chunksFetched += 1;
    metrics.strokesRestored += strokes;
    metrics.approximateResponseBytes += bytes;
    if (strokes > 0 && metrics.firstChunkMs === null) {
        metrics.firstChunkMs = Math.round(performance.now() - startedAt);
    }
}

export function recordRestorationTime(startedAt) {
    if (!import.meta.env?.DEV) return;
    metrics.totalRestorationMs = Math.round(performance.now() - startedAt);
}

export function recordCatchupStart() {
    if (import.meta.env?.DEV) metrics.catchupRuns += 1;
}

export function recordCatchupChunk(strokes) {
    if (!import.meta.env?.DEV) return;
    metrics.catchupChunks += 1;
    metrics.catchupStrokesRestored += strokes;
}

export function recordCatchupComplete(durationMs) {
    if (import.meta.env?.DEV) metrics.catchupDurationMs += durationMs;
}

export function recordCatchupFailure() {
    if (import.meta.env?.DEV) metrics.catchupFailures += 1;
}
