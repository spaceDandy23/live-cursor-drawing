export function canvasPointFromClient(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (clientX - rect.left) * canvas.width / rect.width,
        y: (clientY - rect.top) * canvas.height / rect.height,
    };
}
