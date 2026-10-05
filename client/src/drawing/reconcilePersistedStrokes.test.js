import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcilePersistedStrokes } from './reconcilePersistedStrokes.js';

test('persisted copy replaces matching live and active copies', () => {
    const local = [{ strokeId: 'own' }, { strokeId: 'still-live' }];
    const remote = { alice: [{ strokeId: 'seen-before-disconnect' },
        { strokeId: 'other-unsaved' }] };
    const active = { bob: { strokeId: 'partially-seen' } };
    const localRedo = [{ strokeId: 'own' }];
    const remoteRedo = { alice: [{ strokeId: 'seen-before-disconnect' }] };
    const result = reconcilePersistedStrokes([
        { clientStrokeId: 'own' },
        { clientStrokeId: 'seen-before-disconnect' },
        { clientStrokeId: 'partially-seen' },
    ], local, remote, active, localRedo, remoteRedo);
    assert.deepEqual(result.remainingLocal, [{ strokeId: 'still-live' }]);
    assert.deepEqual(remote.alice, [{ strokeId: 'other-unsaved' }]);
    assert.deepEqual(active, {});
    assert.deepEqual(result.remainingLocalRedo, []);
    assert.deepEqual(remoteRedo.alice, []);
    assert.deepEqual(result.changedRemoteUsers, ['alice', 'bob']);
    assert.deepEqual(result.removedActive, ['partially-seen']);
});

test('legacy records without a logical id do not remove unrelated live strokes', () => {
    const remote = { alice: [{ strokeId: 'live' }] };
    const result = reconcilePersistedStrokes([{ _id: 'old-record' }], [], remote, {});
    assert.deepEqual(remote.alice, [{ strokeId: 'live' }]);
    assert.deepEqual(result.changedRemoteUsers, []);
});
