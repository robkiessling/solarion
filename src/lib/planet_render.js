/**
 * Canvas renderer for the planet view. Takes the cell grid produced by planet_map's generateImage and draws it
 * onto an AsciiCanvas. Colors used to live in outside.scss as tile classNames; the canvas needs them in JS, so
 * this module is now the source of truth (the DOM legend reads PLANET_COLORS too).
 */

export const PLANET_COLORS = {
    unknown: '#888888',
    home: '#20d9ff',
    flatland: '#cc7171',
    developing: '#d1eeff',
    developed: '#90EE90',
    mountain: '#bd0707',
    ice: '#ffffff',
    droid: '#ffe14d',
    laserBeam: '#ffff00'
};

// Day/night shading levels (was CSS opacity on .night/.twilight-* classes)
const LIGHT_ALPHA = {
    day: 1,
    twilightDay: 0.7,
    twilightNight: 0.5,
    night: 0.3
};

const SECTOR_DIVIDER_COLOR = 'rgba(62,192,218,0.5)';

/**
 * Draws a planet image onto the canvas, centered on the char grid. The image may be larger than the grid
 * (the endgame laser-beam overlay is much wider than the planet); extra cells draw into the canvas letterbox
 * area and clip at the canvas edge.
 *
 * @param canvasManager {AsciiCanvas} must be constructed with the fillContainer option
 * @param image {Array} 2d array of cells from generateImage: { char, colorKey, color, light, dividers }
 */
export function drawPlanetImage(canvasManager, image) {
    if (image.length === 0) { return; }

    const context = canvasManager.context;
    const fontWidth = canvasManager.fontWidth;
    const fontHeight = canvasManager.fontHeight;

    // Center the image on the grid; a larger image (laser beams) extends symmetrically past the grid edges.
    const imageCols = Math.max(...image.map(row => row.length));
    const [gridX, gridY] = canvasManager.gridOrigin();
    const originX = gridX - ((imageCols - canvasManager.numCols) / 2) * fontWidth;
    const originY = gridY - ((image.length - canvasManager.numRows) / 2) * fontHeight;

    // fillStyle/globalAlpha changes are canvas state churn; neighboring cells usually share them, so only set on change
    let currentColor = null;
    let currentAlpha = null;

    // Baseline sits at the cell bottom (same offset AsciiCanvas.drawImage uses), shifted up by half of any leading
    // (fontHeight minus fontSize) so glyphs are vertically centered when rows have extra spacing
    const baselineOffset = fontHeight - (fontHeight - canvasManager.fontSize) / 2 - 2;

    image.forEach((row, rowIndex) => {
        const top = originY + rowIndex * fontHeight;
        const baseline = top + baselineOffset;

        row.forEach((cell, colIndex) => {
            if (cell.char === undefined || cell.char === ' ') { return; }

            const x = originX + colIndex * fontWidth;
            const color = cell.color || PLANET_COLORS[cell.colorKey] || '#ffffff';
            const alpha = LIGHT_ALPHA[cell.light] !== undefined ? LIGHT_ALPHA[cell.light] : 1;

            if (alpha !== currentAlpha) {
                context.globalAlpha = alpha;
                currentAlpha = alpha;
            }
            if (color !== currentColor) {
                context.fillStyle = color;
                currentColor = color;
            }

            context.fillText(cell.char, x, baseline);

            if (cell.dividers) {
                context.strokeStyle = SECTOR_DIVIDER_COLOR;
                context.beginPath();
                if (cell.dividers.left) {
                    context.moveTo(x, top);
                    context.lineTo(x, top + fontHeight);
                }
                if (cell.dividers.right) {
                    context.moveTo(x + fontWidth, top);
                    context.lineTo(x + fontWidth, top + fontHeight);
                }
                if (cell.dividers.bottom) {
                    context.moveTo(x, top + fontHeight);
                    context.lineTo(x + fontWidth, top + fontHeight);
                }
                context.stroke();
            }
        });
    });

    context.globalAlpha = 1;
}
