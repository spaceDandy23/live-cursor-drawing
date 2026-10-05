// Inspect window.__realtimeMetrics in development DevTools.
const metrics = {
    outgoingCursor: 0,
    outgoingStrokeBatches: 0,
    receivedCursor: 0,
    receivedStrokeBatches: 0,
    durableQueued: 0,
    durableAcknowledged: 0,
    durableResent: 0,
    duplicateDurableIgnored: 0,
    missingRecoveryRequests: 0,
    recoveryTimeouts: 0,
    fullStrokeRecoveryAttempts: 0,
};

if (import.meta.env.DEV) {
    window.__realtimeMetrics = metrics;
}

export const recordRealtimeEvent = (direction, type) => {
    if (!import.meta.env.DEV) return;
    if (type === 'cursor:move') metrics[`${direction}Cursor`] += 1;
    if (type === 'stroke:points') metrics[`${direction}StrokeBatches`] += 1;
};

export const incrementReliabilityMetric = (name, amount = 1) => {
    if (import.meta.env.DEV && Object.hasOwn(metrics, name)) metrics[name] += amount;
};
