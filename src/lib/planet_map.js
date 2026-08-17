import _ from 'lodash';
import {createArray, getIntermediateColor, getRandomFromArray, getRandomIntInclusive, mod, floor, nTimes} from "./helpers";
import {MinHeap} from "./min_heap";
import {
    ALL_DIRECTIONS,
    DISPLAY_COLS,
    getAdjacentCoords,
    stepInCompassDirection,
    getApproxDistance,
    getGraphDistancesFrom,
    NUM_PLANET_ROWS,
    PLANET_COLS,
} from "./planet_geometry";

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

// The planet fraction the sun is directly over at this time of day
export function subsolarFraction(fractionOfDay) {
    return mod(HOME_FRACTION + fractionOfDay - NOON_FRACTION_OF_DAY, 1);
}

// Daylight (0 night .. 1 full day) at `deltaTurns` (0..0.5) from the sub-solar meridian
function daylightAt(deltaTurns) {
    const t = (deltaTurns - (0.25 - TERMINATOR_HALF_WIDTH)) / (2 * TERMINATOR_HALF_WIDTH);
    if (t <= 0) return 1;
    if (t >= 1) return 0;
    return 0.5 + 0.5 * Math.cos(Math.PI * t); // cosine ease, so the terminator has no visible edges
}


// Ice cap run-length rows (alternating [ice, gap, ice, gap, ...]), sized for the uniform 120-col rows.
// The caps wall off the poles (no north/south wrap) and give the viewport mask's polar crop a natural edge.
const NORTH_ICE_CAP_ROWS = [
    [120], // row 0: solid wall
    [14, 2, 20, 1, 26, 2, 18, 1, 36], // row 1: near-solid with a couple of inlets
    [0, 10, 6, 25, 4, 30, 8, 37] // row 2: scattered floes (leading 0 = starts with a gap)
]
const SOUTH_ICE_CAP_ROWS = [
    [0, 12, 5, 28, 6, 24, 7, 38], // third to last row
    [10, 3, 24, 2, 30, 1, 22, 2, 26], // second to last row
    [120] // last row: solid wall
]

// const HOME_STARTING_ROW_RANGE = [3, 7];
const HOME_STARTING_ROW_RANGE = [5, 5]; // TODO Leaving dead center otherwise first 3x3 explored area gets stretched poorly
const NUM_MOUNTAIN_RANGES_RANGE = [50, 62]; // scaled with the uniform grid's larger tile count
const MOUNTAIN_RANGE_SIZE_RANGE = [1, 20];
const MOUNTAIN_WIDEN_CHANCE = 0.6; // per step, chance of a second mountain beside the spine (ranges read 2-ish wide)

const SHOW_DEBUG_MERIDIANS = false;
const NUM_DEBUG_MERIDIANS = 8;
const ADD_MOUNTAINS = true;
const EXPLORE_EVERYTHING = true;
const MARK_SECTORS = false;
const LOG_MAP = false;

const EXPLORATION_TIME_FACTOR = 0.5; // The fastest area takes this amount of time to explore
const START_WITH_ADJ_EXPLORED = true;

/**
 * crossTime: ms for a droid to cross one tile of this terrain (the movement cost / terrain weight).
 * crossUpgrade: research key that must be unlocked before the terrain can be crossed at all; until then it is impassable,
 *   but still revealed by line-of-sight so you can see the barrier.
 * blocksVision (optional): the tile stops sight. It is revealed itself, but nothing behind it is (see
 *   getVisibleCoords). Independent of passability: a ridge you can climb with Mountaineering still hides
 *   what is on the far side.
 * exploreLength: legacy per-tile explore cost used by the old sector-exploration model; removed once droids land.
 */
export const TERRAINS = {
    home: { key: 'home', enum: 0, display: '#', label: 'Command Center', crossTime: EXPLORATION_TIME_FACTOR },
    flatland: { key: 'flatland', enum: 1, display: ',', variants: ['.'], variantShare: 0.15, label: 'Flatland', crossTime: EXPLORATION_TIME_FACTOR, exploreLength: EXPLORATION_TIME_FACTOR }, // Can be developed for mining. Dust and pebbles: deliberately the quietest glyphs on the map, so features stand out against the ground
    developing: { key: 'developing', enum: 2, display: '+', label: 'Replicating', crossTime: EXPLORATION_TIME_FACTOR },
    developed: { key: 'developed', enum: 3, display: '+', label: 'Replicated', crossTime: EXPLORATION_TIME_FACTOR },
    mountain: { key: 'mountain', enum: 4, display: 'Λ', variants: ['∧'], label: 'Mountain', crossTime: EXPLORATION_TIME_FACTOR * 3, crossUpgrade: 'mountaineering', blocksVision: true, exploreLength: EXPLORATION_TIME_FACTOR * 3 }, // Blocked until researched, then slow to cross; also hides what is behind it
    // ice: { key: 'ice', enum: 5, display: '▲', variants: ['∆'], label: 'Ice', crossTime: EXPLORATION_TIME_FACTOR * 3, crossUpgrade: 'iceCrossing', exploreLength: EXPLORATION_TIME_FACTOR * 3 }, // Blocked until researched, then slow to cross. White glaciers: solid peaks with the odd hollow one, a wall like the mountains but in ice
    ice: { key: 'ice', enum: 5, display: '*', label: 'Ice', crossTime: EXPLORATION_TIME_FACTOR * 3, crossUpgrade: 'iceCrossing', exploreLength: EXPLORATION_TIME_FACTOR * 3 }, // Blocked until researched, then slow to cross. White glaciers: solid peaks with the odd hollow one, a wall like the mountains but in ice
    acid: { key: 'acid', enum: 6, display: '~', variants: ['≈'], label: 'Acid Flats', crossTime: EXPLORATION_TIME_FACTOR * 2, crossUpgrade: 'sealedChassis' }, // The mid-world belt; binary gate (Sealed Chassis or no)
}

// Hive-tainted flatland (sector.infestedBy) gets its own glyph, not just a tint (a tint alone is impossible
// to tell on the night side): a carpet of little omegas spreading out from the nest's big 'Ω', the nest's
// territory. Only flatland is ever stamped infested (see generatePois), so no other terrain loses its glyph
// to this.
export const INFESTED_GLYPH = 'ω';
// The powered grid is lit at night: the command center at full running-lights brightness (planet_render's
// SELF_LIT_ALPHA), replicated land at this dimmer floor, so your footprint reads like city lights on the dark
// side while wild ground goes black. Replicating tiles are still under construction: unpowered, unlit.
const GRID_GLOW_ALPHA = 0.5;


// A stable 0..1 value per tile (and per `salt`, so independent uses don't correlate). Anything that varies
// tile to tile (glyph variants, animation phase) keys off this rather than the clock or Math.random, so the
// texture never flickers frame to frame and looks the same at every rotation.
function tileHash(row, col, salt) {
    return ((row * 7919 + col * 104729 + salt) % 1000) / 1000;
}

// Terrains with `variants` draw the legend glyph on most tiles and a variant on the rest, chosen by tileHash.
// A terrain's `variantShare` overrides the default share (flatland keeps its texture sparse: it covers most
// of the map, and every variant there is visual noise).
const VARIANT_SHARE = 0.35; // fraction of tiles that show a variant glyph instead of the legend one
export function terrainGlyph(terrainEnum, row, col) {
    const attributes = TERRAINS_BY_ENUM[terrainEnum];
    if (!attributes.variants) { return attributes.display; }
    const share = attributes.variantShare === undefined ? VARIANT_SHARE : attributes.variantShare;
    const hash = tileHash(row, col, 12345);
    if (hash >= share) { return attributes.display; }
    return attributes.variants[Math.floor((hash / share) * attributes.variants.length)];
}

if (SHOW_DEBUG_MERIDIANS) {
    nTimes(NUM_DEBUG_MERIDIANS, i => {
        const key = `meridian_${i}`;
        TERRAINS[key] = { key: key, enum: 100 + i, display: (i % 16).toString(16).toUpperCase(), exploreLength: EXPLORATION_TIME_FACTOR }
        // TERRAINS[key] = { key: key, enum: 100 + i, display: '*', exploreLength: EXPLORATION_TIME_FACTOR }
    })
}

const TERRAINS_BY_ENUM = {};
for (const [key, attributes] of Object.entries(TERRAINS)) {
    TERRAINS_BY_ENUM[attributes.enum] = attributes;
}

export const STATUSES = {
    unknown: { key: 'unknown', enum: 0, display: '·', label: 'Unknown' },
    exploring: { key: 'exploring', enum: 1, label: 'Exploring' },
    explored: { key: 'explored', enum: 2, label: 'Explored' }
}
const STATUSES_BY_ENUM = {};
for (const [key, attributes] of Object.entries(STATUSES)) {
    STATUSES_BY_ENUM[attributes.enum] = attributes;
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
const LASER_BEAM_SKIP_ROWS = []; // beam is empty for these rows
const LASER_BEAM_STREAKS = { // some beams make a streak onto the planet itself
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





export function generateRandomMap() {
    const map = [];

    // Start by initializing entire map as flatland
    nTimes(NUM_PLANET_ROWS, () => {
        map.push(createArray(PLANET_COLS, () => createSector(TERRAINS.flatland, STATUSES.unknown)));
    });

    if (ADD_MOUNTAINS) addMountainRanges(map);

    addIceCaps(map);

    if (SHOW_DEBUG_MERIDIANS) generateDebugMeridians(map);

    const homeCoord = addHomeBase(map);

    cacheDistancesToHome(map, homeCoord);

    stampRegions(map, homeCoord);

    if (MARK_SECTORS) markSectors(map);

    cacheCoords(map);

    if (LOG_MAP) logMap(map);

    return map;
}

function logMap(map) {
    let str = '';

    map.forEach((row, rowIndex) => {
        row.forEach(sector => {
            str += TERRAINS_BY_ENUM[sector.terrain].display;
        });
        str += '\n'
    })
    console.log(str);
}

function cacheCoords(map) {
    map.forEach((row, rowIndex) => {
        row.forEach((sector, colIndex) => {
            sector.coord = [rowIndex, colIndex];
        })
    })
}

// A 'sector' is one tile on the map. I.e. the map is a 2d array of sectors
function createSector(terrain, status) {
    return {
        terrain: terrain.enum,
        status: status.enum,
        exploreLength: terrain.exploreLength
    }
}

const NUM_SECTOR_MERIDIANS = 8;
function markSectors(map) {
    // Meridians are straight columns on the uniform grid: divider lines at evenly-spaced columns
    for (let i = 0; i < NUM_SECTOR_MERIDIANS; i++) {
        const colIndex = floor(i / NUM_SECTOR_MERIDIANS * PLANET_COLS);
        const prevCol = mod(colIndex - 1, PLANET_COLS);
        for (let rowIndex = 0; rowIndex < NUM_PLANET_ROWS; rowIndex++) {
            map[rowIndex][colIndex].sectorDividerLeft = true;
            map[rowIndex][prevCol].sectorDividerRight = true;
        }
    }

    const firstThird = floor(NUM_PLANET_ROWS / 3) - 1
    for (let i = 0; i < PLANET_COLS; i++) {
        map[firstThird][i].sectorDividerBottom = true
    }
    const secondThird = floor(NUM_PLANET_ROWS / 3 * 2) - 1
    for (let i = 0; i < PLANET_COLS; i++) {
        map[secondThird][i].sectorDividerBottom = true
    }
}

// Draws some evenly-spaced meridian columns on the map to help with debugging.
function generateDebugMeridians(map) {
    for (let i = 0; i < NUM_DEBUG_MERIDIANS; i++) {
        const colIndex = floor(i / NUM_DEBUG_MERIDIANS * PLANET_COLS);
        for (let rowIndex = 0; rowIndex < NUM_PLANET_ROWS; rowIndex++) {
            if (map[rowIndex][colIndex].terrain < 100) {
                map[rowIndex][colIndex] = createSector(TERRAINS[`meridian_${i}`], STATUSES.explored);
            }
        }
    }

    const middleRow = floor(NUM_PLANET_ROWS / 2)
    for (let i = 0; i < PLANET_COLS; i++) {
        map[middleRow][i] = createSector(TERRAINS[`meridian_${1}`], STATUSES.explored);
    }
}

// Adds ice in the top row
function addIceCaps(map) {
    NORTH_ICE_CAP_ROWS.forEach((iceLengths, rowIndex) => {
        addIceRow(map, rowIndex, iceLengths);
    })

    SOUTH_ICE_CAP_ROWS.forEach((iceLengths, rowIndex) => {
        rowIndex += (NUM_PLANET_ROWS - SOUTH_ICE_CAP_ROWS.length);
        addIceRow(map, rowIndex, iceLengths);
    });
}

function addIceRow(map, rowIndex, iceLengths) {
    let colIndex = 0;

    iceLengths.forEach((iceLength, i) => {
        const isGap = i % 2 === 1;
        nTimes(iceLength, i => {
            if (colIndex + i < PLANET_COLS) {
                map[rowIndex][colIndex + i] = createSector(isGap ? TERRAINS.flatland : TERRAINS.ice, STATUSES.unknown);
            }
        })
        colIndex += iceLength;
    })
}

function addMountainRanges(map) {
    const numMountainRanges = getRandomIntInclusive(...NUM_MOUNTAIN_RANGES_RANGE);

    for (let i = 0; i < numMountainRanges; i++) {
        const mountainRangeSize = getRandomIntInclusive(...MOUNTAIN_RANGE_SIZE_RANGE);
        const mountainRangeStartRow = getRandomIntInclusive(0, NUM_PLANET_ROWS - 1);
        const mountainRangeStartCol = getRandomIntInclusive(0, PLANET_COLS - 1);
        addMountainRange(map, mountainRangeSize, mountainRangeStartRow, mountainRangeStartCol)
    }
}

/**
 * Each mountain range is aimed at a random primary direction. As the range is built, it will have a high
 * chance of heading in the primary direction, a smaller chance of heading in the secondary direction
 * (e.g. if primary is E, secondary directions are NE/SE), and a small chance of heading in a random direction.
 */
function addMountainRange(map, size, startingRow, startingCol) {
    const primaryDirection = getRandomFromArray(ALL_DIRECTIONS);
    const secondaryDirections = primaryDirection.length === 2 ? primaryDirection.split('') :
        ALL_DIRECTIONS.filter(dir => dir.length === 2 && dir.includes(primaryDirection));

    let currentCoord = [startingRow, startingCol];

    // Mountains never overwrite ice: the home-adjacent range is stamped AFTER the ice caps, and it must not
    // punch holes in the polar walls.
    const raise = ([row, col]) => {
        if (map[row][col].terrain !== TERRAINS.ice.enum) {
            map[row][col] = createSector(TERRAINS.mountain, STATUSES.unknown);
        }
    };

    for (let step = 0; step < size; step++) {
        raise(currentCoord);

        // Widen the range: sometimes raise a neighboring tile too, so ranges read as 2-cell-thick massifs
        // instead of 1-cell strings (thin diagonal strings look crossable and read poorly during travel).
        if (Math.random() < MOUNTAIN_WIDEN_CHANCE) {
            raise(getRandomFromArray(getAdjacentCoords(currentCoord)));
        }

        // Choose next direction
        let direction;
        const rand = Math.random();
        if (rand < 0.4) { direction = primaryDirection; }
        else if (rand < 0.7) { direction = getRandomFromArray(secondaryDirections); }
        else { direction = getRandomFromArray(ALL_DIRECTIONS); }

        // Move towards the randomly chosen direction (if possible)
        currentCoord = stepInCompassDirection(currentCoord, direction) || currentCoord;
    }
}

function addHomeBase(map) {
    const homeRow = getRandomIntInclusive(...HOME_STARTING_ROW_RANGE);
    const homeCol = floor(HOME_FRACTION * PLANET_COLS);

    if (ADD_MOUNTAINS) {
        // Create a mountain range near to home (so it somewhat matches the scenery)
        addMountainRange(map, 5, homeRow, homeCol);
    }

    // Add home
    map[homeRow][homeCol] = createSector(TERRAINS.home, STATUSES.explored);

    // Home must never spawn walled in (the squad couldn't leave until mountaineering): if the scenery range
    // enclosed it, flatten one neighbor as an opening.
    const neighbors = getAdjacentCoords([homeRow, homeCol]);
    if (!neighbors.some(([row, col]) => map[row][col].terrain === TERRAINS.flatland.enum)) {
        const opening = getRandomFromArray(neighbors.filter(([row, col]) => map[row][col].terrain !== TERRAINS.ice.enum));
        if (opening) {
            map[opening[0]][opening[1]] = createSector(TERRAINS.flatland, STATUSES.unknown);
        }
    }

    // The starting clearing: exactly what the squad would light up standing on the pad, sight lines and all,
    // so the opening view reads as ground already scanned rather than an arbitrary patch. A scenery ridge
    // next to home therefore walls off part of the view from the first frame.
    if (START_WITH_ADJ_EXPLORED) {
        getVisibleCoords(map, [homeRow, homeCol]).forEach(([row, col]) => {
            map[row][col].status = STATUSES.explored.enum
        });
    }

    if (EXPLORE_EVERYTHING) {
        map.forEach((row, rowIndex) => {
            row.forEach((sector, colIndex) => {
                if (rowIndex !== map.length) {
                    sector.status = STATUSES.explored.enum
                }
            });
        });
    }

    return [homeRow, homeCol]
}

/**
 * --- The region stamp pass ---
 * Three concentric regions, defined by hop distance (pure topology, so the boundaries are unbreakable rings):
 *   R1 "the bowl": inside a mountain ring around home, with ONE gate tile (the cave; opens with the drill).
 *   R3 "the antipode": inside a ring around the point opposite home, with one gate tile (the sealed door;
 *      opens with the override module).
 *   R2 "the scarred belt": everything else, cut in half by a band of acid at mid-distance (crossable only
 *      with the sealed chassis). The band converts mountains too: mountains have their own cross upgrade,
 *      and a crossable mountain inside the belt would leak a path around the acid gate.
 * Ice is never overwritten (the polar walls complete every ring), and ring/band tiles that are already
 * mountains just stay mountains.
 *
 * Because neighboring tiles differ by at most 1 in hop distance, making every tile AT the ring distance
 * impassable (except the gate) fully seals the interior; single-tile thickness is enough.
 */
export const REGIONS = { bowl: 1, belt: 2, antipode: 3 };
export const BOWL_RING_DISTANCE = 8;       // ring at this hop distance from home; interior is R1
export const ANTIPODE_RING_DISTANCE = 7;   // ring around the antipode; interior is R3
export const ACID_BAND_DISTANCES = [38, 40]; // inclusive hop-distance band of acid (the mid-world gate)
export const GATE_KINDS = { cave: 'cave', door: 'door' };

function stampRegions(map, homeCoord) {
    const antipodeCoord = [
        NUM_PLANET_ROWS - 1 - homeCoord[0],
        mod(homeCoord[1] + PLANET_COLS / 2, PLANET_COLS)
    ];
    const antipodeDistances = getGraphDistancesFrom(antipodeCoord);
    const isStampable = (sector) => // ice (the polar walls) and home are never restamped
        sector.terrain !== TERRAINS.ice.enum && sector.terrain !== TERRAINS.home.enum;

    const bowlRing = [];
    const antipodeRing = [];

    map.forEach((row, rowIndex) => {
        row.forEach((sector, colIndex) => {
            const homeDist = sector.graphDistanceHome;
            const antipodeDist = antipodeDistances[rowIndex][colIndex];

            sector.region = homeDist < BOWL_RING_DISTANCE ? REGIONS.bowl :
                (antipodeDist < ANTIPODE_RING_DISTANCE ? REGIONS.antipode : REGIONS.belt);

            if (!isStampable(sector)) return;

            if (homeDist === BOWL_RING_DISTANCE) {
                bowlRing.push({ sector, coord: [rowIndex, colIndex] });
            }
            else if (antipodeDist === ANTIPODE_RING_DISTANCE) {
                antipodeRing.push({ sector, coord: [rowIndex, colIndex] });
            }
            else if (homeDist >= ACID_BAND_DISTANCES[0] && homeDist <= ACID_BAND_DISTANCES[1]) {
                sector.terrain = TERRAINS.acid.enum; // mutate in place: cached distances/coords must survive
            }
        });
    });

    const caveCoord = stampRingWithGate(map, bowlRing, BOWL_RING_DISTANCE,
        (r, c) => map[r][c].graphDistanceHome, GATE_KINDS.cave);
    const doorCoord = stampRingWithGate(map, antipodeRing, ANTIPODE_RING_DISTANCE,
        (r, c) => antipodeDistances[r][c], GATE_KINDS.door);

    // Guarantee the critical path. Scenery mountain ranges can otherwise pocket a gate or the antipode
    // interior, leaving the seed unfinishable. Carve the cheapest corridors (converting only scenery
    // mountains -- never ice, never ring tiles) so home -> cave -> door -> antipode are always connected
    // for a fully-tooled squad. Usually carves nothing: existing flat ground costs 0, so open routes win.
    const isRingTile = ([r, c]) =>
        map[r][c].graphDistanceHome === BOWL_RING_DISTANCE || antipodeDistances[r][c] === ANTIPODE_RING_DISTANCE;
    if (caveCoord && doorCoord) {
        carveCorridor(map, homeCoord, caveCoord, isRingTile);
        carveCorridor(map, caveCoord, doorCoord, isRingTile);
        carveCorridor(map, doorCoord, antipodeCoord, isRingTile);
    }
}

// Dijkstra from `fromCoord` to `toCoord` where existing squad-walkable ground (with all tools) is free and
// scenery mountains cost 1; ice and ring tiles (except the endpoints) are walls. Converts the mountains on
// the winning path to flatland. Generation-time only.
function carveCorridor(map, fromCoord, toCoord, isRingTile) {
    const key = ([r, c]) => `${r},${c}`;
    const fromK = key(fromCoord);
    const toK = key(toCoord);

    const dist = { [fromK]: 0 };
    const prev = {};
    const settled = new Set();
    const heap = new MinHeap();
    heap.push(0, fromCoord);

    while (heap.size > 0) {
        const { priority: distance, value: coord } = heap.pop();
        const k = key(coord);
        if (k === toK) break;
        if (settled.has(k)) continue;
        settled.add(k);

        getAdjacentCoords(coord).forEach(neighbor => {
            const nk = key(neighbor);
            const sector = map[neighbor[0]][neighbor[1]];
            if (sector.terrain === TERRAINS.ice.enum) return;
            if (nk !== toK && nk !== fromK && isRingTile(neighbor)) return;

            const stepCost = sector.terrain === TERRAINS.mountain.enum ? 1 : 0;
            const newDist = distance + stepCost;
            if (newDist < (dist[nk] ?? Infinity)) {
                dist[nk] = newDist;
                prev[nk] = coord;
                heap.push(newDist, neighbor);
            }
        });
    }

    let current = toCoord;
    while (current !== undefined && key(current) !== fromK) {
        const sector = map[current[0]][current[1]];
        if (sector.terrain === TERRAINS.mountain.enum) {
            sector.terrain = TERRAINS.flatland.enum;
        }
        current = prev[key(current)];
    }
}

// Turns a ring's tiles to mountain, keeping exactly one as the flat gate tile (sector.gated blocks scouts
// and marks where the gate POI goes; the squad opens it through the POI flow, which clears the flag).
// Prefers a gate whose interior and exterior neighbors are both flat, so scenery mountains can't leave the
// opened gate facing a wall; falls back to any flat ring tile, then to converting a mountain one.
function stampRingWithGate(map, ringEntries, ringDistance, distAt, gateKind) {
    const isFlat = ([r, c]) => map[r][c].terrain === TERRAINS.flatland.enum;

    const openable = ringEntries.filter(({ coord }) =>
        isFlat(coord) &&
        getAdjacentCoords(coord).some(([r, c]) => distAt(r, c) < ringDistance && isFlat([r, c])) &&
        getAdjacentCoords(coord).some(([r, c]) => distAt(r, c) > ringDistance && isFlat([r, c])));
    const flat = ringEntries.filter(({ coord }) => isFlat(coord));
    const pool = openable.length > 0 ? openable : (flat.length > 0 ? flat : ringEntries);
    const gate = getRandomFromArray(pool);

    ringEntries.forEach(({ sector }) => {
        if (gate && sector === gate.sector) {
            sector.terrain = TERRAINS.flatland.enum;
            sector.gated = true;
            sector.gateKind = gateKind;
        }
        else {
            sector.terrain = TERRAINS.mountain.enum;
        }
    });

    return gate ? gate.coord : null;
}

export function getHomeBasePosition(map) {
    let coord;

    map.forEach((row, rowIndex) => {
        row.forEach((sector, colIndex) => {
            if (sector.terrain === TERRAINS.home.enum) {
                coord = [rowIndex, colIndex];
            }
        });
    });

    return {
        coord: coord,
        rotation: HOME_FRACTION - 0.25 // the rotation required to center home base.
    };
}

function isSameCoord(coord1, coord2) {
    return coord1[0] === coord2[0] && coord1[1] === coord2[1];
}

// The powered grid: home base plus replicated land. The squad recharges here, cargo banks here, the survey
// halo radiates from here, and development grows from here. Mid-replication ('developing') tiles are still
// under construction -- not powered until the cast finishes. (They also never exist when development picks
// its next batch: replicate is single-flight and the previous batch completes before the next cast starts.)
export const GRID_TERRAINS = new Set([TERRAINS.home.enum, TERRAINS.developed.enum, TERRAINS.flatland.enum]);

export function isOnGrid(map, coord) {
    return GRID_TERRAINS.has(map[coord[0]][coord[1]].terrain);
}

// Halo radius at Survey Automation unlock (in hops; the design's R). Comms upgrades will raise the live
// value (planet state's haloRadius) later; this is just its starting point.
export const SURVEY_HALO_RADIUS = 7;

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
let gridHaloCache = null;
export function getGridHalo(map, radius) {
    if (gridHaloCache && gridHaloCache.map === map && gridHaloCache.radius === radius) {
        return gridHaloCache.result;
    }

    const halo = new Set();
    const ring = new Set();
    let frontier = [];

    map.forEach((row, rowIndex) => {
        row.forEach((sector, colIndex) => {
            if (GRID_TERRAINS.has(sector.terrain)) {
                halo.add(`${rowIndex},${colIndex}`);
                frontier.push([rowIndex, colIndex]);
            }
        });
    });

    for (let distance = 1; distance <= radius && frontier.length > 0; distance++) {
        const nextFrontier = [];
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

// The TERRAINS attributes object for a sector's terrain enum (display char, label, colorKey, crossTime).
export function getTerrain(terrainEnum) {
    return TERRAINS_BY_ENUM[terrainEnum];
}

// ms to cross one tile of the given terrain, given the set of unlocked crossing upgrades. Returns Infinity when the
// terrain is currently blocked (its crossUpgrade hasn't been researched). `unlocks` is a map like { mountaineering: true }.
export function getCrossTime(terrainEnum, unlocks = {}) {
    const terrain = TERRAINS_BY_ENUM[terrainEnum];
    if (terrain.crossUpgrade && !unlocks[terrain.crossUpgrade]) { return Infinity; }
    return terrain.crossTime;
}

export function isPassable(map, coord, unlocks = {}) {
    if (coord === null) { return false; }
    return getCrossTime(map[coord[0]][coord[1]].terrain, unlocks) < Infinity;
}

// Line-of-sight range of the driven squad, in hops. Sight walks the 4-neighbor adjacency graph, so an
// unobstructed blob is a diamond (12 tiles at 2 hops), not a square. Also the starting clearing around home.
export const VISION_HOPS = 3;
// Reveal range of a scout droid from the tile it stands on, in hops (same line-of-sight walk, so mountains
// wall off a scout's view too). Their lookout targeting uses the same range, so a scout never walks to a
// tile it has already fully revealed from a distance.
export const SCOUT_VISION_HOPS = 1;

export function blocksVision(terrainEnum) {
    return !!TERRAINS_BY_ENUM[terrainEnum].blocksVision;
}

/**
 * Everything visible from `coord` within `hops` (excluding `coord` itself). Same flood fill as
 * getCoordsWithinHops, with one rule added: a vision-blocking tile is revealed but never expanded through,
 * so a ridge shows up as a wall and hides the ground behind it. Because sight flows around obstacles the
 * same way movement does, a lone peak only hides the tile directly behind it; a run of them hides an arc.
 * The tile being looked FROM never blocks (standing on a summit shouldn't blind you).
 */
export function getVisibleCoords(map, coord, hops = VISION_HOPS) {
    const visited = new Set([`${coord[0]},${coord[1]}`]);
    let frontier = [coord];
    const result = [];

    for (let step = 0; step < hops && frontier.length > 0; step++) {
        const nextFrontier = [];
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

// Scout passability: beyond raw terrain, infested ground (sector.infestedBy, stamped around nests) and
// unopened gate tiles (sector.gated) stop the dumb remotes. The player-driven squad ignores both -- it can
// cross infestation freely and opens gates through the POI flow.
export function isScoutPassable(map, coord, unlocks = {}) {
    if (!isPassable(map, coord, unlocks)) { return false; }
    const sector = map[coord[0]][coord[1]];
    return !sector.infestedBy && !sector.gated;
}

function cacheDistancesToHome(map, homeCoord) {
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
export function getNextDevelopmentArea(map, size, anchorCoord) {
    const distanceTo = (coord) => anchorCoord ?
        getApproxDistance(anchorCoord, coord) : map[coord[0]][coord[1]].distanceHome;

    // Infested ground isn't developable until its nest is cleared; an unopened gate tile isn't either.
    const isCandidate = ([row, col]) =>
        map[row][col].terrain === TERRAINS.flatland.enum &&
        map[row][col].status === STATUSES.explored.enum &&
        !map[row][col].infestedBy && !map[row][col].gated;

    const seen = new Set(); // candidate or chosen already (never re-added)
    const candidates = [];
    const addCandidatesAround = (coord) => {
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

    const chosen = [];
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
        const leftovers = [];
        map.forEach((row, rowIndex) => {
            row.forEach((sector, colIndex) => {
                const coord = [rowIndex, colIndex];
                if (!seen.has(`${rowIndex},${colIndex}`) && isCandidate(coord)) leftovers.push(coord);
            });
        });
        _.sortBy(leftovers, distanceTo)
            .slice(0, size - chosen.length)
            .forEach(coord => chosen.push(coord));
    }

    return chosen;
}

export function getCurrentDevelopmentArea(map) {
    const coords = []
    map.forEach((row, rowIndex) => {
        row.forEach((sector, colIndex) => {
            if (sector.terrain === TERRAINS.developing.enum) {
                coords.push([rowIndex, colIndex])
            }
        });
    });
    return coords;
}


export function isMapFullyExplored(map) {
    return map.every(row => {
        return row.every(sector => {
            return sector.status === STATUSES.explored.enum;
        })
    })
}

export function numSectorsMatching(map, status, terrain) {
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
export function sunTrackingRotation(fractionOfDay) {
    return mod(subsolarFraction(fractionOfDay) - DISPLAY_COLS / 2 / PLANET_COLS + SUN_TRACKING_INSET, 1);
}

// Returns the rotation that horizontally centers `coord` in the display window (the follow-team camera).
// displayStart = floor(rotation * PLANET_COLS), so centering means starting half a display-window before the column.
export function centeringRotation(coord) {
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
export function isDisplayCellVisible(imageRow, imageCol) {
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
export function coordToImageCell(coord, rotation) {
    const [row, col] = coord;
    if (row < 0 || row >= NUM_PLANET_ROWS) return null;

    const displayColIndex = mod(col - floor(rotation * PLANET_COLS), PLANET_COLS);
    if (displayColIndex >= DISPLAY_COLS) return null; // on the far (hidden) side of the planet

    return [row, displayColIndex];
}

export function imageCellToCoord(imageRow, imageCol, rotation) {
    if (imageRow < 0 || imageRow >= NUM_PLANET_ROWS) return null;
    if (imageCol < 0 || imageCol >= DISPLAY_COLS) return null;

    return [imageRow, mod(floor(rotation * PLANET_COLS) + imageCol, PLANET_COLS)];
}

// The mask factor at a fractional screen column (linear interpolation between the cell samples; 0 outside
// the display window). With the camera mid-slide, chars land between mask cells; sampling the mask at the
// char's actual screen position keeps the silhouette and limb fade fixed to the screen while terrain scrolls.
function maskFactorAt(rowIndex, screenCol) {
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
// 0..1 lantern lift for a tile at (row, col) given the lantern at fractional (lRow, lCol)
function lanternLift(row, col, lantern) {
    const dRow = row - lantern.row;
    // Cells are half as wide as tall (CHAR_RATIO 0.5), so a column counts for half a row on screen
    const dCol = (mod(col - lantern.col + PLANET_COLS / 2, PLANET_COLS) - PLANET_COLS / 2) * 0.5;
    const distance = Math.sqrt(dRow * dRow + dCol * dCol);
    if (distance <= LANTERN_RADIUS) { return 1; }
    if (distance >= LANTERN_RADIUS + LANTERN_FALLOFF) { return 0; }
    return 1 - (distance - LANTERN_RADIUS) / LANTERN_FALLOFF;
}

// Living ground: the whole known map moves a little, always (deployed or not), so the planet reads as a
// place rather than a chart. One entry per kind of ground that moves, keyed by terrain key ('infested' is
// the override for hive-tainted tiles); each holds its own tuning and an animate(timeMs, row, col, hash)
// returning { char?, alpha? } for this frame, or null for "at rest". Only ever applied to bare ground (no
// marker on the tile), never to unknown tiles. Set the table to {} to switch it all off. New glyphs must
// exist in the common monospace fonts (Menlo, Consolas, DejaVu).
const GROUND_LIFE = {
    // Hive tissue breathes: a slow brightness swell, tiles nearly in phase (one organism) with a little
    // per-tile drift; and once in a while a tile twitches, a tendril whipping up and pulling back.
    infested: {
        breathPeriodMs: 2600,
        breathDepth: 0.4,     // how far a full exhale dims a tile
        breathDrift: 0.3,     // max per-tile phase offset (fraction of a breath)
        twitchEveryMs: 5000,  // per-tile cycle length; where in it the twitch falls comes from the hash
        twitchMs: 320,        // whole twitch, split evenly across the frames
        twitchFrames: ['ξ', 'ζ'],
        animate(timeMs, row, col, hash) {
            const phase = (timeMs / this.breathPeriodMs + hash * this.breathDrift) % 1;
            const swell = 0.5 - 0.5 * Math.cos(2 * Math.PI * phase); // 0 (inhaled) .. 1 (exhaled)
            const twitchAt = (timeMs + hash * this.twitchEveryMs) % this.twitchEveryMs;
            const twitching = twitchAt < this.twitchMs;
            return {
                alpha: 1 - this.breathDepth * swell,
                char: twitching ? this.twitchFrames[Math.floor(twitchAt / this.twitchMs * this.twitchFrames.length)] : undefined
            };
        }
    },
    // Acid ripples: a crest glyph travelling diagonally across the flats.
    acid: {
        stepMs: 420,          // the wave advances one tile per this
        wavelength: 4,        // tiles from crest to crest
        crestGlyph: '≈',
        animate(timeMs, row, col) {
            const crest = (Math.floor(timeMs / this.stepMs) + row + col) % this.wavelength === 0;
            return crest ? { char: this.crestGlyph } : null;
        }
    }
};
function groundLife(sector, timeMs) {
    if (timeMs === undefined || sector.status === STATUSES.unknown.enum) return null;
    const life = GROUND_LIFE[sector.infestedBy ? 'infested' : TERRAINS_BY_ENUM[sector.terrain].key];
    if (!life) return null;
    const [row, col] = sector.coord;
    return life.animate(timeMs, row, col, tileHash(row, col, 777));
}

// overlays: { "row,col": { char, colorKey, color?, ping? } } -- markers drawn over tiles (scout droids, POIs,
// expedition squad, fight effects, path highlights). Keyed by planet coords, so they ride the rotation mapping.
// cameraShift: sub-column camera offset in cell units (the follow-cam mid-slide). The sampled window widens by
// one column per side and every char draws shifted by -cameraShift (see drawPlanetImage), so the whole scene
// scrolls smoothly under the screen-fixed silhouette.
// lantern: { row, col } (fractional planet coords, mid-slide) of the deployed squad's light, or null.
// timeMs: the game clock that animates the ground (groundLife); undefined leaves the map still.
export function generateImage(map, fractionOfDay, rotation, cookedPct, overlays = {}, cameraShift = 0, lantern = null, timeMs = undefined) {
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
    const subsolar = subsolarFraction(fractionOfDay);
    const centerFraction = rotation + cameraShift / PLANET_COLS + DISPLAY_COLS / 2 / PLANET_COLS;
    const centerToSun = mod(subsolar - centerFraction + 0.5, 1) - 0.5; // signed turns from disc centre to the sun

    let asciiImage = map.map((planetRow, rowIndex) => {
        const displayRow = [];
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
            //   dividers: { left, right, bottom } debug sector borders
            let char, colorKey, color, dividers, selfLit;

            // Unknown ground draws as a full, dim dot field, not blank or sparse: the limb fade and the
            // terminator only read as a sphere when there is a continuous surface for them to shade, and the
            // fog is that surface before anything is explored (blank fog made the known patch look like a
            // spotlight sliding over a flat map; sparse fog looked like noise). Fog vs ground is carried by
            // colour instead: cool grey fog against warm ground (PLANET_COLORS.unknown / flatland).
            if (sector.status === STATUSES.unknown.enum) {
                char = STATUSES.unknown.display;
                colorKey = STATUSES.unknown.key;
            }
            else {
                char = terrainGlyph(sector.terrain, sector.coord[0], sector.coord[1]);
                colorKey = TERRAINS_BY_ENUM[sector.terrain].key;
                // Infested ground: its own glyph in the sick tint; both retract when the nest is cleared
                if (sector.infestedBy) { char = INFESTED_GLYPH; colorKey = 'infested'; }
                // The grid's lights (see GRID_GLOW_ALPHA)
                if (sector.terrain === TERRAINS.home.enum) { selfLit = true; }
                else if (sector.terrain === TERRAINS.developed.enum) { selfLit = GRID_GLOW_ALPHA; }
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
            const daylight = daylightAt(Math.abs(centerOffset - centerToSun));

            if (cookedPct) {
                color = getIntermediateColor(COOK_COLOR_START, COOK_COLOR_END, cookedPct)
                char = daylight > 0.5 ? COOKED_CHAR : TERRAINS.flatland.display;
            }

            // Living ground on bare tiles (a marker's own char/alpha wins over the ground under it)
            if (!overlay || (!overlay.char && overlay.alpha === undefined)) {
                const life = groundLife(sector, timeMs);
                if (life) {
                    if (life.char) { char = life.char; }
                    if (life.alpha !== undefined) { alpha = (alpha === undefined ? 1 : alpha) * life.alpha; }
                }
            }

            // The lantern only matters where the ambient shading is below full day
            let lit;
            if (lantern && daylight < 1) {
                lit = lanternLift(sector.coord[0], sector.coord[1], lantern) || undefined;
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

            displayRow.push({ char, colorKey, color, daylight, lit, selfLit, dividers, ping, alpha, offsetX, offsetY, haloEdges, float });
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

function addLaserBeams(planetImage, fractionOfDay) {
    const heightPadding = floor((LASER_BEAM_HEIGHT - NUM_PLANET_ROWS) / 2);
    const widthPadding = floor((LASER_BEAM_WIDTH - DISPLAY_COLS) / 2);

    // start by making a 2d array of beams
    let result = createArray(LASER_BEAM_HEIGHT, (rowIndex) => {
        const char = LASER_BEAM_LINE_CHARS[rowIndex];

        // initialize beam as a long array of beam chars
        const row = createArray(LASER_BEAM_WIDTH, () => {
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