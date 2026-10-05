// Saved strokes are painted before callers redraw any affected live layer, so
// the two copies cannot remain visible together after the current JS turn.
export function reconcilePersistedStrokes(persisted, local, remote, activeRemote,
    localRedo = [], remoteRedo = {}) {
    const ids = new Set(persisted.map(stroke => stroke.clientStrokeId).filter(Boolean));
    const localBefore = local.length;
    const remainingLocal = local.filter(stroke => !ids.has(stroke.strokeId));
    const remainingLocalRedo = localRedo.filter(stroke => !ids.has(stroke.strokeId));
    const changedRemoteUsers = [];
    const removedActive = [];
    for (const userId of Object.keys(remote)) {
        const before = remote[userId].length;
        remote[userId] = remote[userId].filter(stroke => !ids.has(stroke.strokeId));
        if (remote[userId].length !== before) changedRemoteUsers.push(userId);
    }
    for (const userId of Object.keys(remoteRedo)) {
        remoteRedo[userId] = remoteRedo[userId].filter(stroke => !ids.has(stroke.strokeId));
    }
    for (const [userId, active] of Object.entries(activeRemote)) {
        if (!ids.has(active.strokeId)) continue;
        removedActive.push(active.strokeId);
        delete activeRemote[userId];
        if (!changedRemoteUsers.includes(userId)) changedRemoteUsers.push(userId);
    }
    return {
        remainingLocal,
        remainingLocalRedo,
        localChanged: remainingLocal.length !== localBefore,
        localRedoChanged: remainingLocalRedo.length !== localRedo.length,
        changedRemoteUsers,
        removedActive,
        persistedIds: ids,
    };
}
