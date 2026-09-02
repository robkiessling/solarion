import {NUM_PLANET_ROWS, PLANET_COLS} from "./planet_geometry";
import {getTerrain, STATUSES, TERRAINS} from "./planet_map";
import {mod} from "./helpers";
import {POI_COLOR_KEYS, POI_GLYPHS} from "./expeditions";

/**
 * The vista: a driver's-eye skyline of the ground ahead of the squad, drawn from the map tiles in the
 * direction it is facing. The globe shows the team from orbit; this is the view out the front window, and
 * it is how the player "sees" a mountain they can never stand on.
 *
 * Layout: VISTA_BANDS lateral bands (center band straight ahead, left-to-right as the driver sees them),
 * each BAND_WIDTH chars wide, over SKY_ROWS rows of sky plus one ground row.
 *   ground row: the terrain of the tile directly ahead in that band (one step out).
 *   sky rows:   the nearest mountain within VISTA_DEPTH tiles ahead in that band rises as a peak, taller
 *               the closer it is (VISTA_DEPTH - distance + 1 rows); a nearer mountain hides what is behind.
 *   markers:    a site one step ahead sits on the ground line; two steps ahead, just above it.
 * Returns rows top-to-bottom, each a list of { text, colorKey } segments (colorKey into PLANET_COLORS).
 */
export const VISTA_BANDS = 7;
export const VISTA_DEPTH = 3;
export const BAND_WIDTH = 5;
export const SKY_ROWS = VISTA_DEPTH;

export interface VistaSegment { text: string; colorKey: string }

// Ground line per terrain key (BAND_WIDTH chars). Unknown ground is the dark past the headlights.
/** What the ground row can show: a terrain, hive ground, the dark past the headlights, or nothing past the poles */
type VistaGround = TerrainKey | 'infested' | 'unknown' | 'void';

const GROUND: Record<VistaGround, string> = {
    home: '#####',
    flatland: '_____',
    developing: '+++++',
    developed: '+++++',
    mountain: '_____', // the rocky foot under a peak that fills the sky rows
    ice: '=====',
    acid: '~~~~~',
    water: '~~~~~',
    infested: '%%%%%',
    unknown: '·····',
    void: '     ' // past the pole rows: nothing there
};

// Peak sprites by height (rows), top row first, each BAND_WIDTH wide; adjacent full-height peaks join
// into a range ("/   \/   \")
const PEAKS: Record<number, string[]> = {
    1: ['  Λ  '],
    2: ['  Λ  ', ' / \\ '],
    3: ['  Λ  ', ' / \\ ', '/   \\']
};

const HEADINGS: Record<string, string> = { '0,-1': 'north', '1,0': 'east', '0,1': 'south', '-1,0': 'west' };
export function headingName(facing: [number, number]) {
    return HEADINGS[`${facing[0]},${facing[1]}`] || 'north';
}

// The tile `ahead` steps out and `side` steps to the driver's right of coord, given a screen-space facing
// [dx, dy] (right-hand vector is facing rotated a quarter turn clockwise: [-dy, dx]). null past the poles.
function tileAt(map: PlanetMap, coord: Coord, facing: [number, number], ahead: number, side: number): Sector | null {
    const [dx, dy] = facing;
    const row = coord[0] + ahead * dy + side * dx;
    if (row < 0 || row >= NUM_PLANET_ROWS) return null;
    return map[row][mod(coord[1] + ahead * dx + side * (-dy), PLANET_COLS)];
}

function groundKey(sector: Sector | null): VistaGround {
    if (!sector) return 'void';
    if (sector.status === STATUSES.unknown.key) return 'unknown';
    if (sector.infestedBy) return 'infested';
    return getTerrain(sector.terrain).key;
}

export function buildVista(map: PlanetMap, pois: Record<string, Poi>, squad: Squad): VistaSegment[][] {
    const facing = squad.facing || [0, -1];
    const half = Math.floor(VISTA_BANDS / 2);
    const rows: VistaSegment[][] = [];
    for (let i = 0; i <= SKY_ROWS; i++) rows.push([]);

    // Available site markers by tile, so a band can pick up what is standing ahead of it
    const markers: Record<string, Poi> = {};
    Object.values(pois || {}).forEach(poi => {
        if (poi.status !== 'available') return;
        markers[`${poi.coord[0]},${poi.coord[1]}`] = poi;
    });

    for (let side = -half; side <= half; side++) {
        // Nearest visible ridge in this band, and any marker within sight of it
        let peakDistance: number | null = null;
        let marker: { poi: Poi, ahead: number } | null = null;
        for (let ahead = 1; ahead <= VISTA_DEPTH; ahead++) {
            const sector = tileAt(map, squad.coord, facing, ahead, side);
            if (!sector || sector.status === STATUSES.unknown.key) continue;
            if (ahead <= 2 && !marker) {
                const poi = markers[`${sector.coord[0]},${sector.coord[1]}`];
                if (poi) marker = { poi, ahead };
            }
            if (sector.terrain === TERRAINS.mountain.key) { peakDistance = ahead; break; }
        }

        const nearest = tileAt(map, squad.coord, facing, 1, side);
        const ground = groundKey(nearest);
        const peakHeight = peakDistance === null ? 0 : VISTA_DEPTH - peakDistance + 1;
        const peak = PEAKS[peakHeight] || [];

        // Sky rows: empty air, then the peak's rows stacked down onto the ground line
        for (let r = 0; r < SKY_ROWS; r++) {
            const peakRow = r - (SKY_ROWS - peak.length);
            let text = peakRow >= 0 ? peak[peakRow] : ' '.repeat(BAND_WIDTH);
            let colorKey = 'mountain';
            // A site two steps out shows just above the ground line, unless a nearer ridge is in the way
            if (r === SKY_ROWS - 1 && marker && marker.ahead === 2 && peakDistance !== 1) {
                pushWithMarker(rows[r], text, colorKey, marker.poi);
            }
            else {
                rows[r].push({ text, colorKey });
            }
        }

        // Ground row, with a site one step out sitting on it
        const groundText = GROUND[ground] || GROUND.flatland;
        if (marker && marker.ahead === 1) {
            pushWithMarker(rows[SKY_ROWS], groundText, ground, marker.poi);
        }
        else {
            rows[SKY_ROWS].push({ text: groundText, colorKey: ground });
        }
    }

    return rows;
}

// A band's row with the site glyph dropped into its center char
function pushWithMarker(row: VistaSegment[], text: string, colorKey: string, poi: Poi) {
    const mid = Math.floor(BAND_WIDTH / 2);
    row.push({ text: text.slice(0, mid), colorKey });
    row.push({ text: POI_GLYPHS[poi.type], colorKey: POI_COLOR_KEYS[poi.type] });
    row.push({ text: text.slice(mid + 1), colorKey });
}
