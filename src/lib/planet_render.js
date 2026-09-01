// @ts-check
/**
 * Canvas renderer for the planet view. Takes the cell grid produced by planet_map's generateImage and draws it
 * onto an AsciiCanvas. Colors used to live in outside.scss as tile classNames; the canvas needs them in JS, so
 * this module is now the source of truth (the DOM legend reads PLANET_COLORS too).
 */

import {PLANET_COLS} from "./planet_geometry";
import {drawStarField} from "./star_field";

export const PLANET_COLORS = {
    unknown: '#3f4652',   // fog: dim and cool (blue-grey), so warm flatland reads as new ground next to it
    home: '#20d9ff',
    flatland: '#7f5d47',  // dusty clay: warm like the mountains but desaturated, so ground recedes yet never matches the cool fog
    developing: '#8c8c8c',    // replicating: inert grey until the cast finishes and the tiles power up
    developed: '#6fd3b0',  // grown land; the same hue toned down so a built-up day side doesn't outshout the terrain
    developedNight: '#ffb455', // city lights: replicated land warms toward sodium amber as daylight falls
    mountain: '#e07f30',  // the horizon peaks' orange in the base view (backgrounds.planet), so it is the same rock
    ice: '#ffffff',
    acid: '#9acd32',     // the mid-world belt
    water: '#2f6b8f',    // open sea: deep steel blue, cooler and bluer than the fog so unexplored ground never reads as coast
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
    beacon: '#6fd3b0'    // growth beacon; matches developed land, which grows toward it
};

// The map colour of a squad zone (lib/squad.js squadZone: a terrain key, 'infested', or 'grid' for powered
// ground). DOM chrome that echoes the ground the squad is on (terminal terrain notes, the HUD, the frame rim)
// reads this instead of restating the hex in scss, so the palette has one home.
export function zoneColor(zone) {
    return PLANET_COLORS[zone === 'grid' ? 'home' : zone];
}

const HALO_EDGE_ALPHA = 0.45; // how faint the survey-range boundary line is

// Linear blend of two '#rrggbb' colours, t = 0 -> a, 1 -> b (cached per pair at 1% steps: this runs per cell)
const mixCache = new Map();
function mixHex(a, b, t) {
    const key = `${a}|${b}|${Math.round(t * 100)}`;
    let mixed = mixCache.get(key);
    if (mixed) return mixed;
    const ch = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    const q = Math.round(t * 100) / 100;
    mixed = `rgb(${Math.round(ch(a, 0) + (ch(b, 0) - ch(a, 0)) * q)},${Math.round(ch(a, 1) + (ch(b, 1) - ch(a, 1)) * q)},${Math.round(ch(a, 2) + (ch(b, 2) - ch(a, 2)) * q)})`;
    mixCache.set(key, mixed);
    return mixed;
}

/**
 * The sky behind the planet: the shared star field (lib/star_field.js), then the disc's occluding fill.
 *
 * The star field is the depth cue that makes the disc read as a ball being orbited rather than a flat map
 * under a spotlight: the camera pivots about the planet's centre, so the near-side ground slides one way on
 * screen while the sky (beyond the pivot) slides the other, and the disc's hard limb occludes stars, drawing
 * the silhouette for free on the night side and over unexplored ground.
 *
 * `phase` is the camera's longitude over the ground, in turns (rotation, plus the follow-cam's sub-column
 * shift). The sky is referenced to the ground frame, not the sun's: strictly the planet's spin should also
 * drift the stars (a camera parked over one longitude rides the spin), but that drift and a following
 * camera's motion oppose each other whenever the squad outruns the spin (it walks at about twice the spin),
 * so the sky visibly reversed as the team set off. Tying it to the ground instead gives one rule with no
 * reversals: the sky only moves when the camera moves over the ground, always opposite to it (a pan, the
 * follow-cam, or sun-tracking's westward creep), and stands still whenever the camera does. The sky is
 * periodic over one turn, so a full orbit brings the same stars back.
 *
 * (A sun glyph in the margin was tried once against the old banded shading and dropped because it never
 * lined up with the lit edge. The shading now derives from one light direction, planet_map's
 * subsolarFraction, so a sun placed from the same direction would match by construction if it comes back;
 * note though that under the ground-frame sky it could not be a rigid part of the star field, and that in
 * the default sun-tracking view it is behind the camera anyway. The star tab is the sun's home.)
 */
const STAR_PARALLAX = 1.5;   // sky columns per planet column: how much faster the sky pans than the near-side ground
const SKY_COLS = Math.round(PLANET_COLS * STAR_PARALLAX);

export function drawSky(canvasManager, phase, timeMs) {
    const context = canvasManager.context;
    const fontWidth = canvasManager.fontWidth;
    const fontHeight = canvasManager.fontHeight;
    const [originX, originY] = canvasManager.gridOrigin();
    const cx = originX + canvasManager.numCols * fontWidth / 2;
    const cy = originY + canvasManager.numRows * fontHeight / 2;
    const rx = canvasManager.numCols * fontWidth / 2;
    const ry = canvasManager.numRows * fontHeight / 2;

    drawStarField(canvasManager, { offsetCols: phase * SKY_COLS, periodCols: SKY_COLS, timeMs });

    // The planet occludes the sky: fill the disc (the ellipse inscribed in the char grid, the same shape as
    // planet_map's DISPLAY_MASK) with the backdrop, so only what lies beyond the limb survives
    context.fillStyle = PLANET_BACKDROP;
    context.beginPath();
    context.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
    context.fill();
}

// The flat color sitting behind the (transparent) canvas: $space-black in styles/variables.scss (#planet's
// background). Floating markers paint their footprint with it to occlude the tile underneath, and the sky
// pass fills the disc with it to occlude the stars, so keep the two in sync.
const PLANET_BACKDROP = '#000000';

// Grown around a floating marker's ink box so its footprint swallows the antialiased fringe of whatever it
// covers. Raise it if a wide terrain glyph peeks out from behind a narrower marker.
const FLOAT_MASK_PADDING = 1;

// Ink box of a glyph: the tight rectangle its strokes actually paint, as offsets from the (x, baseline)
// anchor fillText draws at. Measured rather than assumed, so a marker's footprint hugs the character
// instead of blanking its whole cell. Cached per font+char; the font only changes on resize.
const inkBoxCache = new Map();
function glyphInkBox(context, char) {
    const cacheKey = `${context.font}|${char}`;
    if (inkBoxCache.has(cacheKey)) { return inkBoxCache.get(cacheKey); } // has(), so a null result caches too

    const metrics = context.measureText(char);
    // Very old browsers don't report the actual bounding box; fall back to blanking the advance width
    const box = metrics.actualBoundingBoxAscent === undefined ?
        null :
        {
            dx: -metrics.actualBoundingBoxLeft,   // positive values on this metric point LEFT of the anchor
            dy: -metrics.actualBoundingBoxAscent, // ...and UP from the baseline
            width: metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight,
            height: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
        };

    inkBoxCache.set(cacheKey, box);
    return box;
}

// Brightness of ground in full night; full day is 1 and a cell's daylight (0..1, smooth through the terminator,
// see planet_map's daylightAt) interpolates between them. Night is deliberately deep: the squad's lantern
// (cell.lit) and the markers' self-lit floor carry readability, so the ambient can go dark enough that night
// is unmistakable next to day and the pool of light around the team means something.
const NIGHT_ALPHA = 0.08;
// Things with their own light never sink below a floor in the dark. selfLit is that floor (0..1); `true`
// means the standard running-lights level below (units, the beacon, the command center; replicated land
// uses a dimmer floor of its own): dimmed enough to still read as night, bright enough to stay findable.
// Everything else (sites, wild ground) goes as dark as the ambient says, and is seen only by the squad's
// lantern.
const SELF_LIT_ALPHA = 0.8;

// Effective brightness of a cell or float from its daylight, self-lit floor, and lantern lift
function shadeAlpha(daylight, selfLit, lit) {
    let alpha = daylight === undefined ? 1 : NIGHT_ALPHA + (1 - NIGHT_ALPHA) * daylight;
    if (selfLit) { alpha = Math.max(alpha, selfLit === true ? SELF_LIT_ALPHA : selfLit); }
    if (lit) { alpha += (1 - alpha) * lit; }
    return alpha;
}

const SECTOR_DIVIDER_COLOR = 'rgba(62,192,218,0.5)';

// Radar pings: expanding, fading rings around a cell. 'hover' is the loud attention ping on a hovered POI
// marker; 'squad' is the quiet always-on locator pulse that lets you follow a deployed expedition team.
const PING_VARIANTS = {
    hover: { color: '#7fe3f5', maxRadiusCells: 2.2, lineWidth: 1.5, rings: 2, maxAlpha: 1 },
    squad: { color: '#20d9ff', maxRadiusCells: 1.5, lineWidth: 1, rings: 1, maxAlpha: 0.45 },
    beacon: { color: PLANET_COLORS.beacon, maxRadiusCells: 1.8, lineWidth: 1, rings: 1, maxAlpha: 0.5 }
};

/**
 * Draws a planet image onto the canvas, centered on the char grid. The image may be larger than the grid
 * (the endgame laser-beam overlay is much wider than the planet); extra cells draw into the canvas letterbox
 * area and clip at the canvas edge.
 *
 * @param canvasManager {import('./ascii_canvas').default} must be constructed with the fillContainer option
 * @param image {Array} 2d array of cells from generateImage: { char, colorKey, color, daylight, dividers }
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
    const floats = []; // sliding markers (the squad), drawn after the cell pass so they clear their neighbors

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
            let color = cell.color || PLANET_COLORS[cell.colorKey] || '#ffffff';
            // Night colouring (city lights) follows the darkness the tile actually sits in: the lantern is white
            // light, so inside its pool the amber washes out and true colours return (mountains and grid stay
            // tellable apart when driving at night). An explicit color (the cook sequence) wins.
            if (cell.nightColorKey && !cell.color && cell.daylight < 1) {
                color = mixHex(color, PLANET_COLORS[cell.nightColorKey], (1 - cell.daylight) * (1 - (cell.lit || 0)));
            }
            // Day/night shading (lifted by the lantern / self-lit floor), multiplied by any per-cell alpha
            // (e.g. the scouts' pulse animation)
            let alpha = shadeAlpha(cell.daylight, cell.selfLit, cell.lit);
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

            // A floating marker rides above the grid on its own offsets, so it is collected here and drawn
            // after every cell: mid-slide it straddles two tiles, and the far one may not be painted yet.
            if (cell.float !== undefined) {
                const floatX = originX + colIndex * fontWidth + (cell.float.offsetX || 0) * fontWidth;
                const floatTop = top + (cell.float.offsetY || 0) * fontHeight;
                floats.push({
                    x: floatX,
                    top: floatTop,
                    char: cell.float.char,
                    color: cell.float.color || PLANET_COLORS[cell.float.colorKey] || '#ffffff',
                    // Day/night shades the marker like anything else on the ground, unless it is self-lit
                    alpha: shadeAlpha(cell.daylight, cell.float.selfLit, cell.lit) *
                        (cell.float.alpha === undefined ? 1 : cell.float.alpha),
                    maskAlpha: cell.float.mask ?
                        (cell.float.maskAlpha === undefined ? 1 : cell.float.maskAlpha) : 0,
                    scale: cell.float.scale === undefined ? 1 : cell.float.scale
                });
                if (cell.float.ping !== undefined) {
                    pings.push({ x: floatX + fontWidth / 2, y: floatTop + fontHeight / 2, ping: cell.float.ping });
                }
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

    // Floating markers. A masked one paints its own ink box in the backdrop color first, so it reads as a
    // solid object standing ON the ground rather than a glyph blended into it: the tile it is sliding off
    // uncovers itself as the footprint clears, and the tile ahead is covered as it arrives. The footprint
    // hugs the character (see glyphInkBox) rather than blanking the cell, so a narrow marker doesn't punch a
    // rectangular hole in the terrain around itself. It is opaque regardless of day/night (an object
    // occludes just as much at night), but still fades with the limb so it can't hole-punch the soft edge.
    floats.forEach(({ x, top, char, color, alpha, maskAlpha, scale }) => {
        if (scale <= 0) { return; } // fully shrunk away (a squad down inside a hive)
        const baseline = top + baselineOffset;

        // Shrinking happens about the cell's center, and wraps the footprint too so the occlusion shrinks
        // with the glyph. Scaling the context (rather than the font) keeps every coordinate below valid.
        const scaled = scale !== 1;
        if (scaled) {
            const centerX = x + fontWidth / 2;
            const centerY = top + fontHeight / 2;
            context.save();
            context.translate(centerX, centerY);
            context.scale(scale, scale);
            context.translate(-centerX, -centerY);
        }

        if (maskAlpha > 0) {
            const ink = glyphInkBox(context, char);
            context.globalAlpha = maskAlpha;
            context.fillStyle = PLANET_BACKDROP;
            if (ink) {
                context.fillRect(x + ink.dx - FLOAT_MASK_PADDING, baseline + ink.dy - FLOAT_MASK_PADDING,
                    ink.width + FLOAT_MASK_PADDING * 2, ink.height + FLOAT_MASK_PADDING * 2);
            }
            else {
                context.fillRect(x, top, fontWidth, fontHeight);
            }
        }
        context.globalAlpha = alpha;
        context.fillStyle = color;
        context.fillText(char, x, baseline);

        if (scaled) { context.restore(); }
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
