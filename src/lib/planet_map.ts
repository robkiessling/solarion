import _ from 'lodash';
import {createArray, getIntermediateColor, getRandomFromArray, getRandomIntInclusive, mod, floor} from "./helpers";
import AUTHORED_MAP_TEXT from "../database/planet/map.txt?raw";
import {HELD_GLYPH, STATUSES, TERRAINS, VISION_HOPS, type SectorStatus, type SectorStatusDef, type TerrainDef, type TerrainKey} from "../database/planet/terrain";
import type {PingVariantId, PlanetColorKey} from "../database/planet/colors";
import {
    DISPLAY_COLS,
    getAdjacentCoords,
    getApproxDistance,
    getGraphDistancesFrom,
    NUM_PLANET_ROWS,
    PLANET_COLS,
} from "./planet_geometry";

// Terrain and status records (TERRAINS, STATUSES, the glyphs) are content in database/planet/terrain.ts;
// this module parses the painted map into sectors of them and answers questions about the result.

/** One tile on the planet map */
export interface Sector {
    terrain: TerrainKey;
    status: SectorStatus;
    exploreLength?: number;
    /** [row, col]; cached on the sector by map generation so callers iterating a map can address it */
    coord: Coord;
    /** heuristic distance to home (development ordering); Infinity until cacheDistancesToHome runs at generation */
    distanceHome: number;
    /** BFS hop distance to home (exploration ordering); Infinity until cacheDistancesToHome runs at generation */
    graphDistanceHome: number;
    /** authored placement zone letter (a-z) */
    zone?: string;
    /** authored exact-placement point letter (A-Z) */
    point?: string;
    /** authored tunnel system digit */
    tunnel?: string;
    /** poiId of the settlement whose territory covers this tile */
    heldBy?: string | null;
    sectorDividerLeft?: boolean;
    sectorDividerRight?: boolean;
    sectorDividerBottom?: boolean;
}

export type PlanetMap = Sector[][];

/** The set of unlocked crossing capabilities, e.g. { drill: true } */
export type Unlocks = { [capability: string]: boolean };

/** A radar ping around a cell or marker: where in its cycle it is, and which look (PING_VARIANTS in database/planet/colors.ts) */
export interface Ping { variant?: PingVariantId; fraction: number }
/** Which of a cell's edges carry a survey-boundary segment */
export interface HaloEdges { top?: boolean; bottom?: boolean; left?: boolean; right?: boolean }
/** A marker that slides between tiles on its own offsets (the squad), drawn over the tile's own glyph */
export interface FloatMarker {
    char: string;
    colorKey?: PlanetColorKey;
    color?: string;
    selfLit?: boolean | number;
    alpha?: number;
    offsetX?: number;
    offsetY?: number;
    /** paint the marker's ink box in the backdrop colour first, so it stands on the ground instead of blending in */
    mask?: boolean;
    maskAlpha?: number;
    scale?: number;
    ping?: Ping;
}
/** A marker drawn over a tile (scout droid, POI, path highlight, ...); see the overlays parameter of generateImage */
export interface CellOverlay {
    char?: string;
    colorKey?: PlanetColorKey;
    color?: string;
    selfLit?: boolean | number;
    ping?: Ping;
    alpha?: number;
    offsetX?: number;
    offsetY?: number;
    haloEdges?: HaloEdges;
    float?: FloatMarker;
}
/** One cell of the rendered planet image (see the field notes in generateImage); drawPlanetImage in planet_render draws these */
export interface DisplayCell {
    char?: string;
    colorKey?: PlanetColorKey;
    color?: string;
    nightColorKey?: PlanetColorKey;
    daylight?: number;
    lit?: number;
    selfLit?: boolean | number;
    alpha?: number;
    dividers?: { left?: boolean; right?: boolean; bottom?: boolean };
    ping?: Ping;
    offsetX?: number;
    offsetY?: number;
    haloEdges?: HaloEdges;
    float?: FloatMarker;
}

// Re-exported so existing consumers (e.g. redux) can keep importing planet-size constants from here.
// The source of truth lives in planet_geometry.
export { NUM_SECTORS } from "./planet_geometry";


const HOME_FRACTION = 0.75; // Defining home to be 75% of the way into planet, this way it lines up with 50% on slider

/**
 * Lighting: one light direction, everything else derived from it. The sun stands over the sub-solar
 * meridian (subsolarFraction); a tile's daylight is a smooth function of its angular distance from that
 * meridian: full day, easing through twilight to night across the terminator (a quarter turn away, as on a
 * real sphere; the ease is the atmosphere). The sky's sun, if drawn, and the sun-tracking camera both take
 * the same direction, so nothing can disagree with the shading.
 *   NOON_FRACTION_OF_DAY: the clock's 12:00. At noon the sun is directly over the command center.
 *   TERMINATOR_HALF_WIDTH: turns either side of the terminator over which daylight eases from full to none
 *     (twilight; 0.05 = 18 degrees each side, about astronomical twilight).
 *   SUN_TRACKING_NIGHT_SLIVER: under the sun-tracking camera, the fraction of the disc's width (at the
 *     equator) in full night at the right edge, with the twilight crescent inboard of it. Some night in view
 *     is what makes the lit disc read as a sphere rather than a lit plate (the Google Earth look).
 */
const NOON_FRACTION_OF_DAY = 0.5;
const TERMINATOR_HALF_WIDTH = 0.05;
const SUN_TRACKING_NIGHT_SLIVER = 0.1;
// How far past the sub-solar meridian the sun-tracking camera looks: night begins a quarter turn plus a
// twilight half-width from the sun, and the disc's half-width is a quarter turn, so the sliver's width (in
// turns, half the disc being 0.5 wide) is what is left over
const SUN_TRACKING_INSET = TERMINATOR_HALF_WIDTH + SUN_TRACKING_NIGHT_SLIVER / 2;

// The planet fraction the sun is directly over at this time of day. The planet spins west to east (columns
// increase eastward, as on Earth), so the sub-solar meridian travels WEST as the day goes on: dawn arrives
// from the east, and the terminator sweeps right to left across the disc.
export function subsolarFraction(fractionOfDay: number) {
    return mod(HOME_FRACTION - (fractionOfDay - NOON_FRACTION_OF_DAY), 1);
}

// Signed turns from the disc's centre to the sun (positive = to the right on screen), for a camera at
// `rotation` plus the follow-cam's sub-column shift: the lighting anchor generateImage shades from.
function sunDirection(fractionOfDay: number, rotation: number, cameraShift = 0) {
    const centerFraction = rotation + cameraShift / PLANET_COLS + DISPLAY_COLS / 2 / PLANET_COLS;
    return mod(subsolarFraction(fractionOfDay) - centerFraction + 0.5, 1) - 0.5;
}

// Daylight (0 night .. 1 full day) at `deltaTurns` (0..0.5) from the sub-solar meridian
function daylightAt(deltaTurns: number) {
    const t = (deltaTurns - (0.25 - TERMINATOR_HALF_WIDTH)) / (2 * TERMINATOR_HALF_WIDTH);
    if (t <= 0) return 1;
    if (t >= 1) return 0;
    return 0.5 + 0.5 * Math.cos(Math.PI * t); // cosine ease, so the terminator has no visible edges
}

const START_WITH_ADJ_EXPLORED = true;

// City lights: the powered grid is lit at night the way a city looks from orbit. The command center is the
// hub: full running-lights brightness (planet_render's SELF_LIT_ALPHA) plus the same lantern pool as the
// squad. Replicated land is a field of warm points that never spill onto the ground around them and vary
// in brightness: dense cores bright, the sprawl's edge dim (DEVELOPED_NIGHT_LIGHT_MIN..MAX by the share of developed
// 8-neighbours, see getGridNight), with a per-tile jitter so it speckles, and the colour warms from the day
// green toward PLANET_COLORS.developedNight as daylight falls. Kept well below day brightness so a heavily
// built planet still shows its terminator and reads as a sphere. Replicating tiles are still under
// construction: unpowered, just dim work lights.
const DEVELOPED_NIGHT_LIGHT_MIN = 0.2;
const DEVELOPED_NIGHT_LIGHT_MAX = 0.5;
const DEVELOPED_NIGHT_LIGHT_JITTER = 0.3; // fraction of a tile's brightness that its hash may take away
const DEVELOPING_NIGHT_LIGHT = 0.15;   // replicating tiles at night: dim work lights on a construction site
// Replicated land is textured, day and night: per-tile brightness varies with a hash (skewed so most tiles
// are near full and a few are properly dim, like a fabric of buildings with the odd dark lot) and a little
// with density (the sprawl's edge dimmer than the cores). DEVELOPED_TEXTURE is how far the dimmest tile drops
// below the brightest (0 = flat); DEVELOPED_TEXTURE_EDGE is the density part's share of that.
const DEVELOPED_TEXTURE = 0.6;
const DEVELOPED_TEXTURE_EDGE = 0.25;
const DEVELOPING_TEXTURE = 0.4; // replicating tiles: the same speckle, shallower, hash only (no density mid-cast)


// A stable 0..1 value per tile (and per `salt`, so independent uses don't correlate). Anything that varies
// tile to tile (glyph variants, animation phase) keys off this rather than the clock or Math.random, so the
// texture never flickers frame to frame and looks the same at every rotation.
function tileHash(row: number, col: number, salt: number) {
    return ((row * 7919 + col * 104729 + salt) % 1000) / 1000;
}

// Terrains with `variants` draw the legend glyph on most tiles and a variant on the rest, chosen by tileHash.
// A terrain's `variantShare` overrides the default share (flatland keeps its texture sparse: it covers most
// of the map, and every variant there is visual noise).
const VARIANT_SHARE = 0.35; // fraction of tiles that show a variant glyph instead of the legend one
export function terrainGlyph(terrainKey: TerrainKey, row: number, col: number) {
    const attributes = TERRAINS[terrainKey];
    if (!attributes.variants) { return attributes.display; }
    const share = attributes.variantShare === undefined ? VARIANT_SHARE : attributes.variantShare;
    const hash = tileHash(row, col, 12345);
    if (hash >= share) { return attributes.display; }
    return attributes.variants[Math.floor((hash / share) * attributes.variants.length)];
}

export const COOK_TIME = 8000;
const COOKED_CHAR = '}'

// once cooking begins, planet color will transition from COOK_COLOR_START to COOK_COLOR_END over COOK_TIME milliseconds.
const COOK_COLOR_START = [255, 180, 0]; // rgb ffb400
const COOK_COLOR_END = [255, 60, 0]; // rgb ff3c00

const LASER_BEAM_WIDTH = 250; // must share parity with DISPLAY_COLS so the beam image centers on whole cells
const LASER_BEAM_HEIGHT = NUM_PLANET_ROWS + 4; // Laser must be larger than planet height
const LASER_BEAM_SPEED = 150;
const LASER_BEAM_CHAR_OPTS = ['-']
const LASER_BEAM_ARROW_CHAR = '~'
// const LASER_BEAM_SKIP_ROWS = [2, 5, 8, 11, 18, 22, 25]; // beam is empty for these rows
const LASER_BEAM_SKIP_ROWS: number[] = []; // beam is empty for these rows
const LASER_BEAM_STREAKS: Record<number, number> = { // some beams make a streak onto the planet itself
    4: 21, // row 4, streak is 21 chars long
    6: 26,
    7: 15,
    9: 14,
    10: 31,
    12: 27,
    14: 32,
    16: 24,
    19: 27,
    21: 21,
}





/**
 * --- The authored map ---
 * The planet is hand-drawn (database/planet/map.txt: NUM_PLANET_ROWS lines of PLANET_COLS chars, an
 * equirectangular grid, so col = (lon + 180) / 3 and row = (90 - lat) / 6). One char per tile:
 *   .      flatland
 *   a-z    flatland in placement zone <letter> (sector.zone): a POI def naming the zone lands on a random tile of it
 *   A-Z    flatland marking one exact spot (sector.point): a POI def naming the point lands on that tile; an
 *          unused point is just flatland
 *   1-9    tunnel mouth; every mouth sharing a digit belongs to one tunnel system (sector.tunnel; mechanics later)
 *   ^      mountain      ~  water (sea)      *  ice      =  shallows (crossable with Amphibious Tracks)
 *   #      home (exactly one; column floor(HOME_FRACTION * PLANET_COLS) keeps the noon/slider math honest)
 * Walls are permanent (mountain, water, ice), so every pocket of land is reachable only through what the
 * drawing leaves open; the load-time check below counts orphaned land so a bad edit shows up in the console.
 * Passage between land masses is by tunnel (the digits); there are no gate tiles, a choke is held by whatever
 * the content pass puts on the point painted there.
 */
/** exploreEverything: a dev skip (src/dev/skips.ts); the map starts fully revealed */
export function generatePlanetMap(exploreEverything = false): PlanetMap {
    return generateAuthoredMap(exploreEverything);
}

export function parseAuthoredMap(text: string): { map: PlanetMap, homeCoord: Coord } {
    const lines = text.replace(/\r/g, '').split('\n').filter(line => line.length > 0);
    if (lines.length !== NUM_PLANET_ROWS) {
        throw new Error(`Authored map has ${lines.length} rows, expected ${NUM_PLANET_ROWS}`);
    }
    let homeCoord: Coord | null = null;
    const map = lines.map((line, rowIndex) => {
        if (line.length !== PLANET_COLS) {
            throw new Error(`Authored map row ${rowIndex} has ${line.length} cols, expected ${PLANET_COLS}`);
        }
        return Array.from(line).map((char, colIndex) => {
            const coord: Coord = [rowIndex, colIndex];
            const flat = () => createSector(TERRAINS.flatland, STATUSES.unknown, coord);
            switch (char) {
                case '.': return flat();
                case '^': return createSector(TERRAINS.mountain, STATUSES.unknown, coord);
                case '~': return createSector(TERRAINS.water, STATUSES.unknown, coord);
                case '=': return createSector(TERRAINS.shallows, STATUSES.unknown, coord);
                case '*': return createSector(TERRAINS.ice, STATUSES.unknown, coord);
                case '#':
                    if (homeCoord) throw new Error(`Authored map has two homes: ${homeCoord} and ${[rowIndex, colIndex]}`);
                    homeCoord = [rowIndex, colIndex];
                    return createSector(TERRAINS.home, STATUSES.explored, coord);
                default:
                    if (char >= 'a' && char <= 'z') { const sector = flat(); sector.zone = char; return sector; }
                    if (char >= 'A' && char <= 'Z') { const sector = flat(); sector.point = char; return sector; }
                    if (char >= '1' && char <= '9') { const sector = flat(); sector.tunnel = char; return sector; }
                    throw new Error(`Authored map: unknown char '${char}' at row ${rowIndex} col ${colIndex}`);
            }
        });
    });
    if (!homeCoord) throw new Error('Authored map has no home (#)');
    return { map, homeCoord };
}

function generateAuthoredMap(exploreEverything: boolean) {
    const { map, homeCoord } = parseAuthoredMap(AUTHORED_MAP_TEXT);

    if (START_WITH_ADJ_EXPLORED) {
        getVisibleCoords(map, homeCoord).forEach(([row, col]) => {
            map[row][col].status = STATUSES.explored.key;
        });
    }
    if (exploreEverything) {
        map.forEach(row => row.forEach(sector => { sector.status = STATUSES.explored.key; }));
    }

    cacheDistancesToHome(map, homeCoord);
    cacheCoords(map);
    warnAboutOrphanedLand(map, homeCoord);
    return map;
}

// Dev aid for the drawing: floods from home over everything a fully-tooled squad could ever cross (tunnel
// mouths sharing a digit adjacent) and reports the flat tiles it can never reach, so a range
// that seals a valley by accident is caught at load instead of by a player. Painted zones and points that
// are cut off are named: content assigned to them would never appear.
function warnAboutOrphanedLand(map: PlanetMap, homeCoord: Coord) {
    const walkable = (sector: Sector) => sector.terrain !== TERRAINS.mountain.key &&
        sector.terrain !== TERRAINS.water.key && sector.terrain !== TERRAINS.ice.key;
    const mouths: Record<string, Coord[]> = {};
    map.forEach(row => row.forEach(sector => {
        if (sector.tunnel) (mouths[sector.tunnel] = mouths[sector.tunnel] || []).push(sector.coord);
    }));
    const seen = new Set([`${homeCoord[0]},${homeCoord[1]}`]);
    let frontier = [homeCoord];
    while (frontier.length > 0) {
        const next: Coord[] = [];
        frontier.forEach(coord => {
            const tunnel = map[coord[0]][coord[1]].tunnel;
            [...getAdjacentCoords(coord), ...(tunnel ? mouths[tunnel] : [])].forEach(([row, col]) => {
                const key = `${row},${col}`;
                if (seen.has(key) || !walkable(map[row][col])) return;
                seen.add(key);
                next.push([row, col]);
            });
        });
        frontier = next;
    }
    let orphaned = 0, total = 0;
    const cutOff = new Set<string>();
    map.forEach((row, rowIndex) => row.forEach((sector, colIndex) => {
        if (!walkable(sector)) return;
        total++;
        if (seen.has(`${rowIndex},${colIndex}`)) return;
        orphaned++;
        if (sector.zone) cutOff.add(`zone ${sector.zone}`);
        if (sector.point) cutOff.add(`point ${sector.point}`);
    }));
    if (orphaned > 0) {
        console.warn(`Authored map: ${orphaned} of ${total} land tiles are unreachable from home (walled off by mountains/water/ice)` +
            (cutOff.size > 0 ? `, including ${[...cutOff].sort().join(', ')}` : ''));
    }
}

function createSector(terrain: TerrainDef, status: SectorStatusDef, coord: Coord): Sector {
    return {
        terrain: terrain.key,
        status: status.key,
        exploreLength: terrain.exploreLength,
        coord,
        distanceHome: Infinity,      // both distances are filled in by cacheDistancesToHome once the map is complete
        graphDistanceHome: Infinity
    }
}

function cacheCoords(map: PlanetMap) {
    map.forEach((row, rowIndex) => {
        row.forEach((sector, colIndex) => {
            sector.coord = [rowIndex, colIndex];
        })
    })
}


export function getHomeBasePosition(map: PlanetMap): { coord: Coord, rotation: number } {
    let coord: Coord | undefined;

    map.forEach((row, rowIndex) => {
        row.forEach((sector, colIndex) => {
            if (sector.terrain === TERRAINS.home.key) {
                coord = [rowIndex, colIndex];
            }
        });
    });

    if (!coord) throw new Error('Planet map has no home base');
    return {
        coord: coord,
        rotation: HOME_FRACTION - 0.25 // the rotation required to center home base.
    };
}

// The powered grid: home base plus replicated land. The squad recharges here, cargo banks here, the survey
// halo radiates from here, and development grows from here. Mid-replication ('developing') tiles are still
// under construction -- not powered until the cast finishes. (They also never exist when development picks
// its next batch: replicate is single-flight and the previous batch completes before the next cast starts.)
export const GRID_TERRAINS = new Set<TerrainKey>([TERRAINS.home.key, TERRAINS.outpost.key, TERRAINS.developed.key]);

export function isOnGrid(map: PlanetMap, coord: Coord): boolean {
    return GRID_TERRAINS.has(map[coord[0]][coord[1]].terrain);
}

/**
 * The grid halo: every tile within `radius` hops of any powered tile, via
 * multi-source BFS on pure topology (terrain is ignored -- the halo is uplink range, not walkability).
 * Scouts only target unknown tiles inside it, and it's drawn as a faint ring so automation's reach is
 * legible at a glance.
 *
 * Returns { halo, ring }: halo is a Set of "row,col" keys (grid tiles included), ring is the subset at
 * exactly `radius` hops (the drawn boundary). Memoized on the map reference: any map change (reveal,
 * development) produces a new array from immutability-helper, so identity is a correct cache key.
 */
let gridHaloCache: { map: PlanetMap, radius: number, result: { halo: Set<string>, ring: Set<string> } } | null = null;
export function getGridHalo(map: PlanetMap, radius: number): { halo: Set<string>, ring: Set<string> } {
    if (gridHaloCache && gridHaloCache.map === map && gridHaloCache.radius === radius) {
        return gridHaloCache.result;
    }

    const halo = new Set<string>();
    const ring = new Set<string>();
    let frontier: Coord[] = [];

    map.forEach((row, rowIndex) => {
        row.forEach((sector, colIndex) => {
            if (GRID_TERRAINS.has(sector.terrain)) {
                halo.add(`${rowIndex},${colIndex}`);
                frontier.push([rowIndex, colIndex]);
            }
        });
    });

    for (let distance = 1; distance <= radius && frontier.length > 0; distance++) {
        const nextFrontier: Coord[] = [];
        frontier.forEach(coord => {
            getAdjacentCoords(coord).forEach(([row, col]) => {
                const key = `${row},${col}`;
                if (!halo.has(key)) {
                    halo.add(key);
                    nextFrontier.push([row, col]);
                    if (distance === radius) ring.add(key);
                }
            });
        });
        frontier = nextFrontier;
    }

    const result = { halo, ring };
    gridHaloCache = { map, radius, result };
    return result;
}

// The TERRAINS attributes object for a sector's terrain enum (display char, label, crossTime).
export function getTerrain(terrainKey: TerrainKey): TerrainDef {
    return TERRAINS[terrainKey];
}

// ms to cross one tile of the given terrain, given the set of unlocked crossing upgrades. Returns Infinity when the
// terrain is currently blocked (its crossUpgrade hasn't been researched). `unlocks` is a map like { mountaineering: true }.
export function getCrossTime(terrainKey: TerrainKey, unlocks: Unlocks = {}): number {
    const terrain = TERRAINS[terrainKey];
    if (terrain.crossUpgrade && !unlocks[terrain.crossUpgrade]) { return Infinity; }
    return terrain.crossTime;
}

export function isPassable(map: PlanetMap, coord: Coord | null, unlocks: Unlocks = {}): boolean {
    if (coord === null) { return false; }
    return getCrossTime(map[coord[0]][coord[1]].terrain, unlocks) < Infinity;
}

export function blocksVision(terrainKey: TerrainKey): boolean {
    return !!TERRAINS[terrainKey].blocksVision;
}

/**
 * Everything visible from `coord` within `hops` (excluding `coord` itself). Same flood fill as
 * getCoordsWithinHops, with one rule added: a vision-blocking tile is revealed but never expanded through,
 * so a ridge shows up as a wall and hides the ground behind it. Because sight flows around obstacles the
 * same way movement does, a lone peak only hides the tile directly behind it; a run of them hides an arc.
 * The tile being looked FROM never blocks (standing on a summit shouldn't blind you).
 */
export function getVisibleCoords(map: PlanetMap, coord: Coord, hops: number = VISION_HOPS): Coord[] {
    const visited = new Set([`${coord[0]},${coord[1]}`]);
    let frontier = [coord];
    const result: Coord[] = [];

    for (let step = 0; step < hops && frontier.length > 0; step++) {
        const nextFrontier: Coord[] = [];
        frontier.forEach(current => {
            getAdjacentCoords(current).forEach(neighbor => {
                const key = `${neighbor[0]},${neighbor[1]}`;
                if (visited.has(key)) { return; }
                visited.add(key);
                result.push(neighbor);
                if (!blocksVision(map[neighbor[0]][neighbor[1]].terrain)) { nextFrontier.push(neighbor); }
            });
        });
        frontier = nextFrontier;
    }

    return result;
}

// Scout passability: beyond raw terrain, held ground (sector.heldBy, stamped around settlements) stops the
// dumb remotes. The player-driven squad crosses territory freely.
export function isScoutPassable(map: PlanetMap, coord: Coord | null, unlocks: Unlocks = {}): boolean {
    if (coord === null || !isPassable(map, coord, unlocks)) { return false; }
    return !map[coord[0]][coord[1]].heldBy;
}

function cacheDistancesToHome(map: PlanetMap, homeCoord: Coord) {
    // graphDistanceHome (BFS hops on the coverage graph) is the unbiased metric used to order exploration; distanceHome
    // (the centered-column metric) is kept for development ordering. See planet_geometry for the difference.
    const graphDistances = getGraphDistancesFrom(homeCoord);
    map.forEach((row, rowIndex) => {
        row.forEach((sector, colIndex) => {
            sector.distanceHome = getApproxDistance(homeCoord, [rowIndex, colIndex]);
            sector.graphDistanceHome = graphDistances[rowIndex][colIndex];
        });
    });
}

/**
 * Returns the coords to develop next. Candidates are explored from the frontier towards `anchorCoord` (if given),
 * otherwise it expands equally in all directions. Will not pass through walls/ice.
 */
export function getNextDevelopmentArea(map: PlanetMap, size: number, anchorCoord: Coord | null): Coord[] {
    const distanceTo = (coord: Coord) => anchorCoord ?
        getApproxDistance(anchorCoord, coord) : map[coord[0]][coord[1]].distanceHome;

    // Held ground isn't developable until its settlement is cleared
    const isCandidate = ([row, col]: Coord) =>
        map[row][col].terrain === TERRAINS.flatland.key &&
        map[row][col].status === STATUSES.explored.key &&
        !map[row][col].heldBy;

    const seen = new Set<string>(); // candidate or chosen already (never re-added)
    const candidates: Coord[] = [];
    const addCandidatesAround = (coord: Coord) => {
        getAdjacentCoords(coord).forEach(neighbor => {
            const key = `${neighbor[0]},${neighbor[1]}`;
            if (!seen.has(key) && isCandidate(neighbor)) {
                seen.add(key);
                candidates.push(neighbor);
            }
        });
    };

    map.forEach((row, rowIndex) => {
        row.forEach((sector, colIndex) => {
            if (GRID_TERRAINS.has(sector.terrain)) addCandidatesAround([rowIndex, colIndex]);
        });
    });

    const chosen: Coord[] = [];
    while (chosen.length < size && candidates.length > 0) {
        let bestIndex = 0;
        for (let i = 1; i < candidates.length; i++) {
            if (distanceTo(candidates[i]) < distanceTo(candidates[bestIndex])) bestIndex = i;
        }
        const pick = candidates.splice(bestIndex, 1)[0];
        chosen.push(pick);
        addCandidatesAround(pick); // the blob just grew; its new neighbors join the frontier
    }

    if (chosen.length < size) {
        const leftovers: Coord[] = [];
        map.forEach((row, rowIndex) => {
            row.forEach((sector, colIndex) => {
                const coord: Coord = [rowIndex, colIndex];
                if (!seen.has(`${rowIndex},${colIndex}`) && isCandidate(coord)) leftovers.push(coord);
            });
        });
        _.sortBy(leftovers, distanceTo)
            .slice(0, size - chosen.length)
            .forEach(coord => chosen.push(coord));
    }

    return chosen;
}

export function getCurrentDevelopmentArea(map: PlanetMap): Coord[] {
    const coords: Coord[] = []
    map.forEach((row, rowIndex) => {
        row.forEach((sector, colIndex) => {
            if (sector.terrain === TERRAINS.developing.key) {
                coords.push([rowIndex, colIndex])
            }
        });
    });
    return coords;
}


export function isMapFullyExplored(map: PlanetMap): boolean {
    return map.every(row => {
        return row.every(sector => {
            return sector.status === STATUSES.explored.key;
        })
    })
}

export function numSectorsMatching(map: PlanetMap, status?: SectorStatus, terrain?: TerrainKey): number {
    let count = 0;

    map.forEach((row, rowIndex) => {
        row.forEach((sector, colIndex) => {
            if ((status === undefined || sector.status === status) && (terrain === undefined || sector.terrain === terrain)) {
                count += 1;
            }
        })
    })

    return count;
}

// If sunTracking is enabled, the camera is always from the sun's POV; the planet rotates in place
// The rotation that keeps the sun-tracking camera fixed relative to the sun: the sub-solar meridian just left
// of the disc's centre (by SUN_TRACKING_INSET), so the ground turns under a still terminator
export function sunTrackingRotation(fractionOfDay: number) {
    return mod(subsolarFraction(fractionOfDay) - DISPLAY_COLS / 2 / PLANET_COLS + SUN_TRACKING_INSET, 1);
}

// Returns the rotation that horizontally centers `coord` in the display window (the follow-team camera).
// displayStart = floor(rotation * PLANET_COLS), so centering means starting half a display-window before the column.
export function centeringRotation(coord: Coord): number {
    return mod(coord[1] - DISPLAY_COLS / 2, PLANET_COLS) / PLANET_COLS;
}

/**
 * The elliptical viewport mask: the planet's round silhouette. The world itself is a uniform cylinder; this
 * render-time crop of the display window is the ONLY thing that makes it look like a globe. 0 = hidden
 * (drawn blank), 1 = fully visible, in between = the soft "limb" fade near the edge that sells the curvature.
 * Cell aspect (charRatio 0.5) makes the 60x30 display window square on screen, so the ellipse renders circular.
 */
const LIMB_FADE_START = 0.88;  // radius where the soft fade begins (1 = the mask edge)
const LIMB_MIN_ALPHA = 0.35;   // brightness at the very edge of the visible disc

export const DISPLAY_MASK = createArray(NUM_PLANET_ROWS, (rowIndex) => {
    return createArray(DISPLAY_COLS, (colIndex) => {
        const nx = (colIndex + 0.5) / DISPLAY_COLS * 2 - 1;
        const ny = (rowIndex + 0.5) / NUM_PLANET_ROWS * 2 - 1;
        const radius = Math.sqrt(nx * nx + ny * ny);

        if (radius > 1) return 0;
        if (radius <= LIMB_FADE_START) return 1;
        return 1 - (radius - LIMB_FADE_START) / (1 - LIMB_FADE_START) * (1 - LIMB_MIN_ALPHA);
    });
});

// Whether a display cell is inside the planet silhouette (clicks on the masked corners should be ignored).
export function isDisplayCellVisible(imageRow: number, imageCol: number) {
    return DISPLAY_MASK[imageRow] !== undefined && (DISPLAY_MASK[imageRow][imageCol] || 0) > 0;
}

/**
 * Fake-sphere terminator math. On a real globe seen face-on, a meridian projects to x = sin(lon)cos(lat), so
 * the day/night boundary bows toward the disc's vertical axis as latitude grows (the crescent). The cylinder
 * maps longitude to x linearly, which left the terminator a straight vertical band. To fake the projection,
 * stretch each cell's horizontal distance from the display center by 1/cos(lat) before the day/night
 * comparison; boundaries then render pulled toward the center column by cos(lat), curving into a crescent.
 * Uses the same normalized-row coordinate as DISPLAY_MASK. The clamp caps the stretch on the pole rows
 * (cos(lat) ~ 0); those cells are mostly masked off anyway, and visible ones stay within a quarter turn of
 * the display center, so the stretched fraction never wraps to the far side of the planet.
 */
const ROW_CURVE_SCALE = createArray(NUM_PLANET_ROWS, (rowIndex) => {
    const ny = (rowIndex + 0.5) / NUM_PLANET_ROWS * 2 - 1;
    return 1 / Math.sqrt(Math.max(1 - ny * ny, 0.01));
});

/**
 * Maps a planet coord to its cell in the generated image (the same windowing + centering math as generateImage):
 * returns [imageRow, imageCol], or null when the coord is outside the current display window. The inverse,
 * imageCellToCoord, turns a clicked image cell back into a planet coord (null for letterbox padding / off-planet).
 */
export function coordToImageCell(coord: Coord, rotation: number) {
    const [row, col] = coord;
    if (row < 0 || row >= NUM_PLANET_ROWS) return null;

    const displayColIndex = mod(col - floor(rotation * PLANET_COLS), PLANET_COLS);
    if (displayColIndex >= DISPLAY_COLS) return null; // on the far (hidden) side of the planet

    return [row, displayColIndex];
}

export function imageCellToCoord(imageRow: number, imageCol: number, rotation: number): Coord | null {
    if (imageRow < 0 || imageRow >= NUM_PLANET_ROWS) return null;
    if (imageCol < 0 || imageCol >= DISPLAY_COLS) return null;

    return [imageRow, mod(floor(rotation * PLANET_COLS) + imageCol, PLANET_COLS)];
}

// The mask factor at a fractional screen column (linear interpolation between the cell samples; 0 outside
// the display window). With the camera mid-slide, chars land between mask cells; sampling the mask at the
// char's actual screen position keeps the silhouette and limb fade fixed to the screen while terrain scrolls.
function maskFactorAt(rowIndex: number, screenCol: number) {
    const row = DISPLAY_MASK[rowIndex];
    const left = floor(screenCol);
    const t = screenCol - left;
    const a = (left >= 0 && left < DISPLAY_COLS) ? row[left] : 0;
    const b = (left + 1 >= 0 && left + 1 < DISPLAY_COLS) ? row[left + 1] : 0;
    return a + (b - a) * t;
}

// The squad's lantern: a pool of daylight that moves with the team, the you-are-here cue and what keeps the
// night side drivable. Distance is measured on screen in row units (a column counts as half a row, since
// cells are half as wide as tall), so the pool is a disc, not a diamond. Both values are continuous; tune
// freely.
//   LANTERN_RADIUS: distance out to which tiles draw at FULL daylight brightness, whatever side of the
//     terminator they are on. Tiles sit on integer positions, so the fully-lit set only changes when the
//     radius crosses one of their distances (1.0 = the tiles directly above/below or two columns over,
//     1.5 = three columns over, 2.0 = two rows up or four columns over, ...).
//   LANTERN_FALLOFF: width of the rim past that radius over which the lift fades linearly from full back to
//     the ambient shading. 0 would be a hard-edged disc; wider is a softer glow.
export const LANTERN_RADIUS = 0.8;
const LANTERN_FALLOFF = 1.2;
// 0..1 lantern lift at a screen distance (row units) from a light
function liftAtDistance(distance: number) {
    if (distance <= LANTERN_RADIUS) { return 1; }
    if (distance >= LANTERN_RADIUS + LANTERN_FALLOFF) { return 0; }
    return 1 - (distance - LANTERN_RADIUS) / LANTERN_FALLOFF;
}

// 0..1 lantern lift for a tile at (row, col) given the lantern at fractional (lRow, lCol)
function lanternLift(row: number, col: number, lantern: Lantern) {
    const dRow = row - lantern.row;
    // Cells are half as wide as tall (CHAR_RATIO 0.5), so a column counts for half a row on screen
    const dCol = (mod(col - lantern.col + PLANET_COLS / 2, PLANET_COLS) - PLANET_COLS / 2) * 0.5;
    return liftAtDistance(Math.sqrt(dRow * dRow + dCol * dCol));
}

// The grid at night, precomputed per map and memoized on the map reference like getGridHalo (any change to
// the map is a new array, so identity is a correct cache key):
//   lift: the command center's lantern, the same pool as the squad's, splatted through a fixed offset
//     kernel so the ground around the hub is lit at night like the ground around the team
//   density: per tile, the share of its 8 neighbours that are developed (0..1); city lights are brighter
//     in dense cores than at the sprawl's edge (see DEVELOPED_NIGHT_LIGHT_MIN/MAX)
const GRID_LANTERN = true;
const LANTERN_TERRAINS = new Set([TERRAINS.home.key]);
const LANTERN_KERNEL = (() => {
    const kernel: [number, number, number][] = [];
    const reach = LANTERN_RADIUS + LANTERN_FALLOFF;
    for (let dRow = -Math.ceil(reach); dRow <= Math.ceil(reach); dRow++) {
        for (let dCol = -Math.ceil(reach * 2); dCol <= Math.ceil(reach * 2); dCol++) {
            const lift = liftAtDistance(Math.sqrt(dRow * dRow + (dCol * 0.5) * (dCol * 0.5)));
            if (lift > 0) { kernel.push([dRow, dCol, lift]); }
        }
    }
    return kernel;
})();
let gridNightCache: { map: PlanetMap, result: { lift: Float32Array[], density: Float32Array[] } } | null = null;
function getGridNight(map: PlanetMap) {
    if (gridNightCache && gridNightCache.map === map) { return gridNightCache.result; }
    const lift = createArray(map.length, () => new Float32Array(PLANET_COLS));
    const density = createArray(map.length, () => new Float32Array(PLANET_COLS));
    const isDeveloped = (r: number, c: number) => r >= 0 && r < map.length && map[r][mod(c, PLANET_COLS)].terrain === TERRAINS.developed.key;
    map.forEach((row, rowIndex) => {
        row.forEach((sector, colIndex) => {
            if (GRID_LANTERN && LANTERN_TERRAINS.has(sector.terrain)) {
                LANTERN_KERNEL.forEach(([dRow, dCol, l]) => {
                    const r = rowIndex + dRow;
                    if (r < 0 || r >= map.length) return;
                    const c = mod(colIndex + dCol, PLANET_COLS);
                    if (l > lift[r][c]) { lift[r][c] = l; }
                });
            }
            if (sector.terrain === TERRAINS.developed.key) {
                let neighbours = 0;
                for (let dRow = -1; dRow <= 1; dRow++) {
                    for (let dCol = -1; dCol <= 1; dCol++) {
                        if ((dRow || dCol) && isDeveloped(rowIndex + dRow, colIndex + dCol)) neighbours++;
                    }
                }
                density[rowIndex][colIndex] = neighbours / 8;
            }
        });
    });
    gridNightCache = { map, result: { lift, density } };
    return gridNightCache.result;
}

// Living ground: the whole known map moves a little, always (deployed or not), so the planet reads as a
// place rather than a chart. One entry per kind of ground that moves, keyed by terrain key ('held' is
// the override key for held tiles, which has no entry: that ground holds still); each holds its own tuning and an animate(timeMs, row, col, hash,
// daylight) returning { char?, alpha? } for this frame, or null for "at rest"; `enabled: false` parks an
// entry. Only ever applied to bare ground (no
// marker on the tile), never to unknown tiles. Set the table to {} to switch it all off. New glyphs must
// exist in the common monospace fonts (Menlo, Consolas, DejaVu).
/**
 * One kind of living ground. Each entry also carries its own tuning fields, which its animate() reads through
 * `this` (see living() below).
 */
interface GroundLife {
    enabled?: boolean;
    animate(timeMs: number, row: number, col: number, hash: number, daylight: number): { char?: string, alpha?: number } | null;
}
/** Builds one kind of living ground from its tuning fields and its animate(), which reads them through `this` */
function living<S extends object>(settings: S,
    animate: (this: S, timeMs: number, row: number, col: number, hash: number, daylight: number) => { char?: string, alpha?: number } | null): GroundLife & S {
    return { ...settings, animate };
}
const GROUND_LIFE = {
    // Replication in progress: the batch pulses out of phase (so it crawls) and tiles flicker briefly to
    // a dot, as if still assembling. PARKED (enabled: false): what read as alive here turned out to be the
    // brightness variation, which replicated land now has statically (DEVELOPED_TEXTURE); kept with its tuning
    // in case a whisper of motion is wanted back.
    developing: living({
        enabled: false,
        pulsePeriodMs: 5000,
        pulseDepth: 0.45,     // how far a tile dims at the bottom of its pulse
        flickerEveryMs: 15000,  // per-tile flicker cycle; a short slice of it shows the dot
        flickerMs: 110,
        flickerGlyph: '·',
    }, function(timeMs, row, col, hash) {
        const pulse = 0.5 + 0.5 * Math.sin(2 * Math.PI * (timeMs / this.pulsePeriodMs + hash));
        const flickerAt = (timeMs + tileHash(row, col, 97) * this.flickerEveryMs) % this.flickerEveryMs;
        return {
            alpha: 1 - this.pulseDepth * pulse,
            char: flickerAt < this.flickerMs ? this.flickerGlyph : undefined
        };
    })
} satisfies Partial<Record<TerrainKey | 'held', GroundLife>>;
const GROUND_LIFE_BY_KEY: Partial<Record<TerrainKey | 'held', GroundLife>> = GROUND_LIFE;
function groundLife(sector: Sector, timeMs: number | undefined, daylight: number) {
    if (timeMs === undefined || sector.status === STATUSES.unknown.key) return null;
    const life = GROUND_LIFE_BY_KEY[sector.heldBy ? 'held' : TERRAINS[sector.terrain].key];
    if (!life || life.enabled === false) return null;
    const [row, col] = sector.coord;
    return life.animate(timeMs, row, col, tileHash(row, col, 777), daylight);
}

// overlays: { "row,col": CellOverlay } -- markers drawn over tiles (scout droids, POIs, expedition squad, fight
// effects, path highlights). Keyed by planet coords, so they ride the rotation mapping.
// cameraShift: sub-column camera offset in cell units (the follow-cam mid-slide). The sampled window widens by
// one column per side and every char draws shifted by -cameraShift (see drawPlanetImage), so the whole scene
// scrolls smoothly under the screen-fixed silhouette.
// lantern: { row, col } (fractional planet coords, mid-slide) of the deployed squad's light, or null.
// timeMs: the game clock that animates the ground (groundLife); undefined leaves the map still.
/** The squad's (or command center's) lantern position, in fractional map rows/cols */
type Lantern = { row: number, col: number };

export function generateImage(map: PlanetMap, fractionOfDay: number, rotation: number, cookedPct: number,
                              overlays: Record<string, CellOverlay> = {}, cameraShift = 0, lantern: Lantern | null = null, timeMs: number | undefined = undefined) {
    const displayStart = floor(rotation * PLANET_COLS);
    const pad = cameraShift === 0 ? 0 : 1;

    // Lighting is computed by screen position, not by tile: the longitude under a screen column is the
    // camera's true (continuous) longitude plus the column's offset. That is exact whenever the camera sits
    // on a whole column (follow-cam, keyboard steps) and at most a column off while it doesn't (a drag, or
    // sun-tracking's continuous creep), which nobody can see; what it buys is a terminator that never
    // stutters: under sun-tracking it holds perfectly still on screen while the ground steps beneath it,
    // and under a drag it glides with the camera. The sub-solar meridian is measured from the disc's centre
    // and each column's offset from the centre is stretched by row (ROW_CURVE_SCALE), so the terminator
    // bows into a crescent like a great circle on a sphere.
    const centerToSun = sunDirection(fractionOfDay, rotation, cameraShift);
    const gridNight = getGridNight(map);

    let asciiImage = map.map((planetRow, rowIndex) => {
        const displayRow: DisplayCell[] = [];
        for (let windowIndex = 0; windowIndex < DISPLAY_COLS + pad * 2; windowIndex++) {
            const sector = planetRow[mod(displayStart - pad + windowIndex, PLANET_COLS)];
            // Where this char actually lands on screen, in display-cell units (fractional mid-slide)
            const screenCol = windowIndex - pad - cameraShift;

            // Viewport mask: cells outside the planet silhouette draw blank; the limb fades out
            const maskFactor = maskFactorAt(rowIndex, screenCol);
            if (maskFactor === 0) { displayRow.push({ char: ' ' }); continue; }

            // Cell fields (consumed by planet_render's drawPlanetImage):
            //   char: the glyph
            //   colorKey: key into PLANET_COLORS (terrain/status key, 'droid', 'laserBeam')
            //   color: explicit color string; overrides colorKey (used by the cook sequence)
            //   daylight: 0 (night) .. 1 (full day), smooth through the terminator
            //   selfLit: brightness floor under the night shading (a marker's running lights, the grid's lights)
            //   nightColorKey: colour to blend toward as daylight falls (city lights warm up at night)
            //   dividers: { left, right, bottom } debug sector borders
            let char, color, dividers, selfLit;
            let colorKey: PlanetColorKey | undefined, nightColorKey: PlanetColorKey | undefined;
            let textureAlpha; // static per-tile brightness texture (replicated land), applied to bare tiles

            // Unknown ground draws as a full, dim dot field, not blank or sparse: the limb fade and the
            // terminator only read as a sphere when there is a continuous surface for them to shade, and the
            // fog is that surface before anything is explored (blank fog made the known patch look like a
            // spotlight sliding over a flat map; sparse fog looked like noise). Fog vs ground is carried by
            // colour instead: cool grey fog against warm ground (PLANET_COLORS.unknown / flatland).
            if (sector.status === STATUSES.unknown.key) {
                char = STATUSES.unknown.display;
                colorKey = 'unknown';
            }
            else {
                char = terrainGlyph(sector.terrain, sector.coord[0], sector.coord[1]);
                colorKey = TERRAINS[sector.terrain].key;
                // Held ground: its own glyph and tint; both retract when the settlement is cleared
                if (sector.heldBy) { char = HELD_GLYPH; colorKey = 'held'; }
                // City lights (see DEVELOPED_NIGHT_LIGHT_MIN)
                if (sector.terrain === TERRAINS.home.key || sector.terrain === TERRAINS.outpost.key) { selfLit = true; }
                else if (sector.terrain === TERRAINS.developed.key) {
                    const [row, col] = sector.coord;
                    const density = gridNight.density[row][col];
                    const jitter = tileHash(row, col, 4321);
                    const core = DEVELOPED_NIGHT_LIGHT_MIN + (DEVELOPED_NIGHT_LIGHT_MAX - DEVELOPED_NIGHT_LIGHT_MIN) * density;
                    selfLit = core * (1 - DEVELOPED_NIGHT_LIGHT_JITTER * jitter);
                    nightColorKey = 'developedNight';
                    textureAlpha = 1 - DEVELOPED_TEXTURE * (DEVELOPED_TEXTURE_EDGE * (1 - density) + (1 - DEVELOPED_TEXTURE_EDGE) * jitter * jitter);
                }
                else if (sector.terrain === TERRAINS.developing.key) {
                    const [row, col] = sector.coord;
                    const jitter = tileHash(row, col, 4321); // same hash as developed, so a tile keeps its spot in the fabric when it powers up
                    selfLit = DEVELOPING_NIGHT_LIGHT;
                    textureAlpha = 1 - DEVELOPING_TEXTURE * jitter * jitter;
                }
            }

            if (sector.sectorDividerLeft || sector.sectorDividerRight || sector.sectorDividerBottom) {
                dividers = {
                    left: sector.sectorDividerLeft,
                    right: sector.sectorDividerRight,
                    bottom: sector.sectorDividerBottom
                }
            }

            let ping, alpha, offsetX, offsetY, haloEdges, float;
            const overlay = overlays[`${sector.coord[0]},${sector.coord[1]}`];
            if (overlay) {
                if (overlay.char) { char = overlay.char; } // color-only overlays keep the terrain glyph (e.g. path highlight)
                if (overlay.colorKey) { colorKey = overlay.colorKey; } // edge-only overlays keep the terrain color too
                if (overlay.color) { color = overlay.color; }
                if (overlay.selfLit !== undefined) { selfLit = overlay.selfLit; } // marker with its own lights: shading floor, see planet_render
                ping = overlay.ping;   // radar-ping cycle; drawn as expanding rings by planet_render
                alpha = overlay.alpha; // per-cell brightness (e.g. scout pulse), multiplied with day/night shading
                offsetX = overlay.offsetX; // sub-cell nudge in cell units (squad slide/bump; see planet_render)
                offsetY = overlay.offsetY;
                haloEdges = overlay.haloEdges; // survey-boundary segments on this cell's edges (see planet_render)
                // A marker that slides between tiles (the squad) rather than replacing this cell's glyph:
                // the tile keeps its own char and the marker draws over it, carrying its own offsets.
                float = overlay.float;
            }

            // Angular distance from the sub-solar meridian: the column's offset from the disc centre, curved by
            // row, minus where the sun is
            const centerOffset = (screenCol - DISPLAY_COLS / 2) / PLANET_COLS * ROW_CURVE_SCALE[rowIndex];

            // Distance measured on the circle (like lanternLift), not linearly: sunDirection wraps at +-0.5
            // when the sun passes directly behind the planet, exactly when the terminator reaches the limb,
            // and a linear difference made the twilight sliver at the edge vanish in one frame.
            const daylight = daylightAt(Math.abs(mod(centerOffset - centerToSun + 0.5, 1) - 0.5));

            if (cookedPct) {
                color = getIntermediateColor(COOK_COLOR_START, COOK_COLOR_END, cookedPct)
                char = daylight > 0.5 ? COOKED_CHAR : TERRAINS.flatland.display;
            }

            // Living ground and brightness texture on bare tiles (a marker's own char/alpha wins over the
            // ground under it, and the cook sequence over everything: a planet being burned lies still)
            if (!cookedPct && (!overlay || (!overlay.char && overlay.alpha === undefined))) {
                if (textureAlpha !== undefined) { alpha = (alpha === undefined ? 1 : alpha) * textureAlpha; }
                const life = groundLife(sector, timeMs, daylight);
                if (life) {
                    if (life.char) { char = life.char; }
                    if (life.alpha !== undefined) { alpha = (alpha === undefined ? 1 : alpha) * life.alpha; }
                }
            }

            // Lanterns (the squad's, the grid's) only matter where the ambient shading is below full day
            let lit;
            if (daylight < 1) {
                let lift = gridNight.lift[sector.coord[0]][sector.coord[1]];
                if (lantern) { lift = Math.max(lift, lanternLift(sector.coord[0], sector.coord[1], lantern)); }
                if (lift > 0) { lit = lift; }
            }

            if (maskFactor < 1) {
                alpha = (alpha === undefined ? 1 : alpha) * maskFactor; // soft limb fade
                // The limb fades a floating marker AND its occluding footprint, so neither survives as a
                // hard-edged artifact out past the planet's soft edge
                if (float) {
                    float = {
                        ...float,
                        alpha: (float.alpha === undefined ? 1 : float.alpha) * maskFactor,
                        maskAlpha: maskFactor
                    };
                }
            }

            displayRow.push({ char, colorKey, color, nightColorKey, daylight, lit, selfLit, dividers, ping, alpha, offsetX, offsetY, haloEdges, float });
        }

        return displayRow;
    });

    if (cookedPct) {
        asciiImage = addLaserBeams(asciiImage, fractionOfDay);
    }

    return asciiImage;
}




const LASER_BEAM_LINE_CHARS = createArray(LASER_BEAM_HEIGHT, rowIndex => {
    return LASER_BEAM_SKIP_ROWS.includes(rowIndex) ? ' ' : getRandomFromArray(LASER_BEAM_CHAR_OPTS);
});

// "arrows" are the moving chars within the beam, so that the beam appears to be in motion.
// They are called arrows because originally the beam looked like: -------->>>>>-------->>>>>-------- (an arrow is the >>>>> section)
// Each beam has a randomly generated arrow size, spacing, and initial offset
const LASER_BEAM_ARROW_LENGTHS = createArray(LASER_BEAM_HEIGHT, rowIndex => {
    return getRandomIntInclusive(1, 7);
})
const LASER_BEAM_ARROW_GAPS = createArray(LASER_BEAM_HEIGHT, rowIndex => {
    return getRandomIntInclusive(3, 7);
})
const LASER_BEAM_ARROW_OFFSETS = createArray(LASER_BEAM_HEIGHT, rowIndex => {
    return getRandomIntInclusive(1, 7);
})

function addLaserBeams(planetImage: DisplayCell[][], fractionOfDay: number): DisplayCell[][] {
    const heightPadding = floor((LASER_BEAM_HEIGHT - NUM_PLANET_ROWS) / 2);
    const widthPadding = floor((LASER_BEAM_WIDTH - DISPLAY_COLS) / 2);

    // start by making a 2d array of beams
    let result: DisplayCell[][] = createArray(LASER_BEAM_HEIGHT, (rowIndex) => {
        const char = LASER_BEAM_LINE_CHARS[rowIndex];

        // initialize beam as a long array of beam chars
        const row = createArray(LASER_BEAM_WIDTH, (): DisplayCell => {
            return {
                char: char,
                colorKey: 'laserBeam'
            }
        });

        // apply arrow calculations
        if (char !== ' ') {
            const arrowLength = LASER_BEAM_ARROW_LENGTHS[rowIndex];
            const arrowGap = LASER_BEAM_ARROW_GAPS[rowIndex];
            const sumLength = arrowLength + arrowGap;
            const dayOffset = (floor(fractionOfDay * sumLength * LASER_BEAM_SPEED)) % sumLength;
            const arrowOffset = LASER_BEAM_ARROW_OFFSETS[rowIndex] + dayOffset;
            let inArrow = true, currentSegment = 0;
            for (let c = -sumLength + arrowOffset; c < LASER_BEAM_WIDTH; c++) {
                if (inArrow && c >= 0) {
                    row[c].char = LASER_BEAM_ARROW_CHAR;
                }
                currentSegment += 1;
                if (currentSegment >= (inArrow ? arrowLength : arrowGap)) {
                    inArrow = !inArrow;
                    currentSegment = 0;
                }
            }
        }

        return row;
    });

    // apply the planet image on top of the 2d beam array
    planetImage.forEach((row, rowIndex) => {
        row.forEach((sector, colIndex) => {
            const { char } = sector;
            const netRowIndex = heightPadding + rowIndex;

            if (char === ' ') { return; }

            // if there is a streak, we do not apply the planet image for that streak part
            if (LASER_BEAM_STREAKS[netRowIndex] && colIndex <= LASER_BEAM_STREAKS[netRowIndex]) { return; }

            result[netRowIndex][widthPadding + colIndex] = sector
        });
    })

    return result;
}