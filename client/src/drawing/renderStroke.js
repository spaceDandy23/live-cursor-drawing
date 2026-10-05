export const PEN_WIDTH = 1;
export const ERASER_WIDTH = 10;

// All canvas layers use the same unscaled 1920×1080 drawing coordinates.
export function drawStrokePoints(ctx, start, points, { color, erase }) {
    if (!start || !points?.length) return;
    ctx.lineWidth = erase ? ERASER_WIDTH : PEN_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color || '#202925';
    ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    let previous = start;
    points.forEach(point => {
        ctx.beginPath();
        ctx.moveTo(previous.x, previous.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
        previous = point;
    });
    ctx.globalCompositeOperation = 'source-over';
}
