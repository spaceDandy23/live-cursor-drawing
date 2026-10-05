import assert from 'node:assert/strict';
import test from 'node:test';
import { canvasPointFromClient } from './coordinates.js';
import { drawStrokePoints, PEN_WIDTH, ERASER_WIDTH } from './renderStroke.js';

test('canvas coordinates do not depend on either viewer scroll offset', () => {
    const canvas = {
        width: 1920, height: 1080,
        getBoundingClientRect: () => ({ left: -250, top: -80, width: 1920, height: 1080 }),
    };
    assert.deepEqual(canvasPointFromClient(canvas, 50, 20), { x: 300, y: 100 });
    canvas.getBoundingClientRect = () => ({ left: 100, top: 40, width: 960, height: 540 });
    assert.deepEqual(canvasPointFromClient(canvas, 250, 90), { x: 300, y: 100 });
});

test('live segments and whole-stroke replay use the same style and segments', () => {
    const makeContext = () => {
        const segments = [];
        const ctx = {
            beginPath() {},
            moveTo(x, y) { this.from = [x, y]; },
            lineTo(x, y) { this.to = [x, y]; },
            stroke() {
                segments.push({ from: this.from, to: this.to, width: this.lineWidth,
                    cap: this.lineCap, join: this.lineJoin, color: this.strokeStyle,
                    operation: this.globalCompositeOperation });
            },
        };
        return { ctx, segments };
    };
    const points = [{ x: 3, y: 4 }, { x: 7, y: 8 }];
    const style = { color: '#123456', erase: false };
    const live = makeContext();
    drawStrokePoints(live.ctx, { x: 0, y: 0 }, [points[0]], style);
    drawStrokePoints(live.ctx, points[0], [points[1]], style);
    const replay = makeContext();
    drawStrokePoints(replay.ctx, { x: 0, y: 0 }, points, style);
    assert.deepEqual(live.segments, replay.segments);
    assert.equal(replay.segments[0].width, PEN_WIDTH);
    assert.equal(replay.segments[0].cap, 'round');
    assert.equal(replay.segments[0].join, 'round');
    assert.equal(replay.segments[0].operation, 'source-over');
    const eraser = makeContext();
    drawStrokePoints(eraser.ctx, { x: 0, y: 0 }, points, { erase: true });
    assert.equal(eraser.segments[0].width, ERASER_WIDTH);
    assert.equal(eraser.segments[0].operation, 'destination-out');
    assert.equal(eraser.ctx.globalCompositeOperation, 'source-over');
});
