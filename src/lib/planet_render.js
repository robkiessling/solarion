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
    acid: '#9acd32',     // the mid-world belt
    infested: '#a06bc9', // hive-tainted ground around a nest; retracts when the nest is cleared
    droid: '#ffe14d',
    droidReturning: '#9a9a9a', // recalled scouts walking home ("off duty")
    laserBeam: '#ffff00',

    // Expedition overlays (POI markers, squad, skirmish effect)
    poiCache: '#ffd700',
    poiNest: '#ff4d4d',
    poiStory: '#c58fff',
    poiGate: '#e0c060',
    poiHighlight: '#ffffff',
    squad: '#20d9ff',    // friendly cyan like home base; keeps the squad readable next to yellow scouts
    battle: '#ff6b35',
    haloRing: '#3ec0da', // survey-range boundary (stroked cell-edge segments, not a char tint)
    beacon: '#90EE90'    // growth beacon; matches developed land, which grows toward it
};

const HALO_EDGE_ALPHA = 0.45; // how faint the survey-range boundary line is

// Day/night shading levels (was CSS opacity on .night/.twilight-* classes)
const LIGHT_ALPHA = {
    day: 1,
    twilightDay: 0.7,
    twilightNight: 0.5,
    night: 0.3
};

const SECTOR_DIVIDER_COLOR = 'rgba(62,192,218,0.5)';

// Radar pings: expanding, fading rings around a cell. 'hover' is the loud attention ping on a hovered POI
// marker; 'squad' is the quiet always-on locator pulse that lets you follow a deployed expedition team.
const PING_VARIANTS = {
    hover: { color: '#7fe3f5', maxRadiusCells: 2.2, lineWidth: 1.5, rings: 2, maxAlpha: 1 },
    squad: { color: '#20d9ff', maxRadiusCells: 1.5, lineWidth: 1, rings: 1, maxAlpha: 0.45 },
    beacon: { color: '#90EE90', maxRadiusCells: 1.8, lineWidth: 1, rings: 1, maxAlpha: 0.5 }
};

/**
 * Draws a planet image onto the canvas, centered on the char grid. The image may be larger than the grid
 * (the endgame laser-beam overlay is much wider than the planet); extra cells draw into the canvas letterbox
 * area and clip at the canvas edge.
 *
 * @param canvasManager {AsciiCanvas} must be constructed with the fillContainer option
 * @param image {Array} 2d array of cells from generateImage: { char, colorKey, color, light, dividers }
 * @param cameraShift {number} sub-column camera offset in cell units (the follow-cam mid-slide); shifts the
 *        whole scene -- chars, halo segments, pings -- while the canvas/silhouette stays put. generateImage
 *        must have been called with the same value (it widens the window and masks by screen position).
 */
export function drawPlanetImage(canvasManager, image, cameraShift = 0) {
    if (image.length === 0) { return; }

    const context = canvasManager.context;
    const fontWidth = canvasManager.fontWidth;
    const fontHeight = canvasManager.fontHeight;

    // Center the image on the grid; a larger image (laser beams, the camera-shift pad columns) extends
    // symmetrically past the grid edges.
    const imageCols = Math.max(...image.map(row => row.length));
    const [gridX, gridY] = canvasManager.gridOrigin();
    const originX = gridX - ((imageCols - canvasManager.numCols) / 2) * fontWidth - cameraShift * fontWidth;
    const originY = gridY - ((image.length - canvasManager.numRows) / 2) * fontHeight;

    // fillStyle/globalAlpha changes are canvas state churn; neighboring cells usually share them, so only set on change
    let currentColor = null;
    let currentAlpha = null;

    const pings = []; // collected during the cell pass, drawn last so rings sit on top of everything
    const haloEdges = []; // survey-boundary segments, batched into one stroke after the cell pass

    // Baseline sits at the cell bottom (same offset AsciiCanvas.drawImage uses), shifted up by half of any leading
    // (fontHeight minus fontSize) so glyphs are vertically centered when rows have extra spacing
    const baselineOffset = fontHeight - (fontHeight - canvasManager.fontSize) / 2 - 2;

    image.forEach((row, rowIndex) => {
        const top = originY + rowIndex * fontHeight;
        const baseline = top + baselineOffset;

        row.forEach((cell, colIndex) => {
            if (cell.char === undefined || cell.char === ' ') { return; }

            // offsetX/offsetY: sub-cell nudge in cell units (squad slide interpolation, bump animation)
            const offsetX = (cell.offsetX || 0) * fontWidth;
            const offsetY = (cell.offsetY || 0) * fontHeight;
            const x = originX + colIndex * fontWidth + offsetX;
            const color = cell.color || PLANET_COLORS[cell.colorKey] || '#ffffff';
            // Day/night shading, multiplied by any per-cell alpha (e.g. the scouts' pulse animation)
            let alpha = LIGHT_ALPHA[cell.light] !== undefined ? LIGHT_ALPHA[cell.light] : 1;
            if (cell.alpha !== undefined) { alpha *= cell.alpha; }

            if (alpha !== currentAlpha) {
                context.globalAlpha = alpha;
                currentAlpha = alpha;
            }
            if (color !== currentColor) {
                context.fillStyle = color;
                currentColor = color;
            }

            context.fillText(cell.char, x, baseline + offsetY);

            if (cell.ping !== undefined) {
                pings.push({ x: x + fontWidth / 2, y: top + offsetY + fontHeight / 2, ping: cell.ping });
            }

            if (cell.haloEdges !== undefined) {
                // Anchored to the cell itself (no offsetX/offsetY): the boundary belongs to the tile, not to
                // a marker glyph sliding across it
                haloEdges.push({ x: originX + colIndex * fontWidth, y: top, edges: cell.haloEdges });
            }

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

    // Survey-range boundary: line segments along the cell edges where the halo ends -- drawn between the
    // chars rather than as tinted glyphs (a tinted line of chars reads as terrain)
    if (haloEdges.length > 0) {
        context.strokeStyle = PLANET_COLORS.haloRing;
        context.globalAlpha = HALO_EDGE_ALPHA;
        context.lineWidth = 1;
        context.beginPath();
        haloEdges.forEach(({ x, y, edges }) => {
            if (edges.top) {
                context.moveTo(x, y);
                context.lineTo(x + fontWidth, y);
            }
            if (edges.bottom) {
                context.moveTo(x, y + fontHeight);
                context.lineTo(x + fontWidth, y + fontHeight);
            }
            if (edges.left) {
                context.moveTo(x, y);
                context.lineTo(x, y + fontHeight);
            }
            if (edges.right) {
                context.moveTo(x + fontWidth, y);
                context.lineTo(x + fontWidth, y + fontHeight);
            }
        });
        context.stroke();
    }

    // Radar pings: rings expand from the cell center and fade as they grow; multiple rings stagger evenly
    if (pings.length > 0) {
        pings.forEach(({ x, y, ping }) => {
            const variant = PING_VARIANTS[ping.variant] || PING_VARIANTS.hover;
            const maxRadius = variant.maxRadiusCells * fontHeight;
            context.strokeStyle = variant.color;
            context.lineWidth = variant.lineWidth;

            for (let i = 0; i < variant.rings; i++) {
                const ringFraction = (ping.fraction + i / variant.rings) % 1;
                context.globalAlpha = (1 - ringFraction) * variant.maxAlpha;
                context.beginPath();
                context.arc(x, y, fontHeight * 0.4 + ringFraction * maxRadius, 0, 2 * Math.PI);
                context.stroke();
            }
        });

        context.lineWidth = 1;
    }

    context.globalAlpha = 1;
}
