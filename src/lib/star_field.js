/**
 * The star field: a hashed, twinkling sky drawn across a whole canvas, shared by every view that looks out
 * into space (the planet tab's sky behind the globe, the star tab's sky behind the sun and swarm).
 *
 * Stars are hashed from integer sky cells (row, column) so the field is stable frame to frame, with
 * continuous sub-cell offsets so they don't sit on the char grid, a faint-heavy brightness spread (a few
 * bright '*', mostly dim '·'), and a slow per-star twinkle. Callers pan it by `offsetCols` (screen columns
 * from the grid origin to sky column 0, fractional, so the sky glides) and may make it periodic
 * (`periodCols`, so a full turn of a camera brings the same stars back). Sky cells are anchored to the
 * canvas's char grid, so the field stays put relative to the scene across resizes.
 *
 * `glare` ({ x, y, innerRadius, outerRadius } in px) fades stars out toward a bright body such as the sun:
 * fully hidden inside innerRadius, untouched beyond outerRadius. Draw the field first; anything in front
 * (a planet's disc, the sun's backing) then occludes it.
 */
const STAR_DENSITY = 0.05;   // chance a sky cell holds a star
const STAR_TWINKLE = 0.3;    // twinkle amplitude, as a fraction of the star's own brightness
const STAR_TWINKLE_MS = [2200, 5200]; // per-star twinkle period, spread across this range
const STAR_BRIGHT_SHARE = 0.06; // fraction of stars that are bright ('*'); the rest are '·'
const STAR_TINTS = ['#ffffff', '#ffffff', '#ffe9c4', '#c9d8ff']; // white, warm, cool

// Well-mixed 0..1 hash of two integers and a salt (a plain linear hash mod 1000 stripes at these densities)
function skyHash(a, b, salt) {
    let h = (a * 374761393 + b * 668265263 + salt * 2246822519) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function drawStarField(canvasManager, { offsetCols = 0, periodCols = null, timeMs = 0, glare = null } = {}) {
    const context = canvasManager.context;
    const fontWidth = canvasManager.fontWidth;
    const fontHeight = canvasManager.fontHeight;
    const [originX, originY] = canvasManager.gridOrigin();

    const firstRow = Math.floor(-originY / fontHeight) - 1;
    const lastRow = Math.ceil((canvasManager.height - originY) / fontHeight);
    const firstCol = Math.floor(-originX / fontWidth - offsetCols) - 1;
    const lastCol = Math.ceil((canvasManager.width - originX) / fontWidth - offsetCols);
    // Baseline sits at the cell bottom, shifted up by half of any leading (as the map renderer does)
    const baseline = fontHeight - (fontHeight - canvasManager.fontSize) / 2 - 2;

    const font = context.font;
    context.font = `${canvasManager.fontSize}px monospace`;
    let currentColor = null;
    for (let row = firstRow; row <= lastRow; row++) {
        for (let col = firstCol; col <= lastCol; col++) {
            const skyCol = periodCols ? ((col % periodCols) + periodCols) % periodCols : col;
            if (skyHash(row, skyCol, 1) >= STAR_DENSITY) continue;

            const magnitude = skyHash(row, skyCol, 2);
            let brightness = 0.15 + 0.85 * magnitude * magnitude * magnitude; // faint-heavy
            const bright = skyHash(row, skyCol, 3) < STAR_BRIGHT_SHARE;
            const periodMs = STAR_TWINKLE_MS[0] + (STAR_TWINKLE_MS[1] - STAR_TWINKLE_MS[0]) * skyHash(row, skyCol, 4);
            const twinkle = 0.5 + 0.5 * Math.sin(2 * Math.PI * (timeMs / periodMs + skyHash(row, skyCol, 5)));
            const color = STAR_TINTS[Math.floor(skyHash(row, skyCol, 6) * STAR_TINTS.length)];

            const x = originX + (col + offsetCols + skyHash(row, skyCol, 7)) * fontWidth;
            const y = originY + (row + skyHash(row, skyCol, 8)) * fontHeight + baseline;

            if (glare) {
                const distance = Math.hypot(x - glare.x, y - glare.y);
                if (distance <= glare.innerRadius) continue;
                if (distance < glare.outerRadius) {
                    brightness *= (distance - glare.innerRadius) / (glare.outerRadius - glare.innerRadius);
                }
            }

            if (color !== currentColor) { context.fillStyle = color; currentColor = color; }
            context.globalAlpha = brightness * (1 - STAR_TWINKLE * twinkle);
            context.fillText(bright ? '*' : '·', x, y);
        }
    }
    context.globalAlpha = 1;
    context.font = font;
}
