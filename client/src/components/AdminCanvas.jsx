import { useEffect, useRef, useState, memo } from "react";
import { drawStrokePoints } from "../drawing/renderStroke.js";
import { createPersistedStrokeLoader } from "../drawing/persistedStrokeLoader.js";
import { recordRestorationChunk, recordRestorationTime, recordCatchupStart,
    recordCatchupChunk, recordCatchupComplete, recordCatchupFailure } from "../drawing/restorationMetrics.js";

export const AdminCanvas = memo(({ refreshVersion, catchupVersion, onPersistedStrokes, height, width }) => {
    const HTTP_URL = import.meta.env.VITE_HTTP_URL;
    const canvasRef = useRef(null);
    const loaderRef = useRef(null);
    const onPersistedRef = useRef(onPersistedStrokes);
    const startedAtRef = useRef(null);
    const initialCompleteRef = useRef(false);
    const previousVersionsRef = useRef({ refreshVersion, catchupVersion });
    const [loadState, setLoadState] = useState('loading');
    const [loadError, setLoadError] = useState('');
    const [restoredCount, setRestoredCount] = useState(0);

    useEffect(() => { onPersistedRef.current = onPersistedStrokes; }, [onPersistedStrokes]);

    useEffect(() => {
        const controller = new AbortController();
        const canvas = canvasRef.current;
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        startedAtRef.current = performance.now();
        initialCompleteRef.current = false;
        if (!HTTP_URL) {
            setLoadError('VITE_HTTP_URL is not configured.');
            setLoadState('error');
            return () => controller.abort();
        }

        const loader = createPersistedStrokeLoader({
            httpUrl: HTTP_URL,
            signal: controller.signal,
            onRunStart: kind => {
                setLoadError('');
                setLoadState(kind === 'initial' ? 'loading' : 'ready');
                if (kind === 'catchup') recordCatchupStart();
            },
            onPage: ({ strokes, bytes }, kind) => {
                if (controller.signal.aborted) return;
                const ctx = canvas.getContext('2d');
                strokes.forEach(stroke => drawStrokePoints(ctx, stroke.move_to, stroke.points, stroke));
                onPersistedRef.current?.(strokes);
                setRestoredCount(count => count + strokes.length);
                if (kind === 'initial') recordRestorationChunk(strokes.length, bytes, startedAtRef.current);
                else {
                    if (kind === 'catchup') recordCatchupChunk(strokes.length);
                    if (strokes.length) setLoadState('syncing');
                }
            },
            onRunComplete: (kind, result) => {
                if (kind === 'initial') {
                    recordRestorationTime(startedAtRef.current);
                    initialCompleteRef.current = true;
                }
                if (kind === 'catchup') recordCatchupComplete(result.durationMs);
                setLoadState('ready');
            },
            onRunError: (kind, error) => {
                if (kind === 'catchup') recordCatchupFailure();
                setLoadError(error.message || 'Saved drawings are temporarily unavailable.');
                setLoadState(kind === 'initial' ? 'error' : 'sync-error');
            },
        });
        loaderRef.current = loader;
        loader.request('initial').catch(() => {});
        return () => {
            controller.abort();
            if (loaderRef.current === loader) loaderRef.current = null;
        };
    }, [HTTP_URL]);

    useEffect(() => {
        const previous = previousVersionsRef.current;
        previousVersionsRef.current = { refreshVersion, catchupVersion };
        if (catchupVersion !== previous.catchupVersion) {
            loaderRef.current?.request('catchup').catch(() => {});
        } else if (refreshVersion !== previous.refreshVersion) {
            loaderRef.current?.request('refresh').catch(() => {});
        }
    }, [refreshVersion, catchupVersion]);

    const retry = () => loaderRef.current?.request(initialCompleteRef.current ? 'catchup' : 'initial')
        .catch(() => {});

    return (
        <>
            {loadState === 'loading' &&
                <div className="canvas-notice" role="status">
                    <span className="loading-spinner" aria-hidden="true" />
                    Restoring saved drawing… {restoredCount > 0 && `${restoredCount.toLocaleString()} strokes loaded`}
                </div>}
            {loadState === 'syncing' &&
                <div className="canvas-notice" role="status">Syncing…</div>}
            {(loadState === 'error' || loadState === 'sync-error') &&
                <div className="canvas-notice error" role="alert">
                    <span>{loadError} {loadState === 'error' && restoredCount > 0 &&
                        `${restoredCount.toLocaleString()} strokes retained.`}</span>
                    {HTTP_URL && <button type="button" onClick={retry}>Retry</button>}
                </div>}
            <canvas ref={canvasRef} height={height} width={width}
                className="drawing-canvas saved-canvas" aria-label="Saved drawing layer" />
        </>
    );
});
