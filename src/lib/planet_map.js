import _ from 'lodash';
import {createArray, getIntermediateColor, getRandomFromArray, getRandomIntInclusive, mod, floor, nTimes} from "./helpers";
import {
    ALL_DIRECTIONS,
    DISPLAY_COLS,
    getAdjacentCoords,
    stepInCompassDirection,
    getCoordsWithinHops,
    getApproxDistance,
    getGraphDistancesFrom,
    NUM_PLANET_ROWS,
    PLANET_COLS,
} from "./planet_geometry";

// Re-exported so existing consumers (e.g. redux) can keep importing planet-size constants from here.
// The source of truth lives in planet_geometry.
export { NUM_SECTORS } from "./planet_geometry";


const HOME_FRACTION = 0.75; // Defining home to be 75% of the way into planet, this way it lines up with 50% on slider
const NIGHT_WIDTH = 0.45; // How much of the planet night should occupy
const SUN_TRACKING_INSET = 0.05; // How much to offset rotation when sunTracking is enabled, so that you can see a little twilight
const TWILIGHT_LENGTH = 0.03; // How much each twilight region should take up

const NIGHT_START = mod(HOME_FRACTION - NIGHT_WIDTH / 2, 1); // Fraction start of night window
const NIGHT_END = mod(HOME_FRACTION + NIGHT_WIDTH / 2, 1); // Fraction end of night window
const TWILIGHT_LENGTH_DISPLAY = TWILIGHT_LENGTH * 2; // When dealing with display lengths, double the twilight length
const SUN_TRACKING_NIGHT_CUTOFF = 1 - SUN_TRACKING_INSET;
const SUN_TRACKING_TWI_NIGHT_CUTOFF = SUN_TRACKING_NIGHT_CUTOFF - TWILIGHT_LENGTH_DISPLAY;
const SUN_TRACKING_TWI_DAY_CUTOFF = SUN_TRACKING_TWI_NIGHT_CUTOFF - TWILIGHT_LENGTH_DISPLAY;


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
const EXPLORE_EVERYTHING = false;
const MARK_SECTORS = false;
const LOG_MAP = false;

const EXPLORATION_TIME_FACTOR = 0.5; // The fastest area takes this amount of time to explore
const START_WITH_ADJ_EXPLORED = true;

/**
 * crossTime: ms for a droid to cross one tile of this terrain (the movement cost / terrain weight).
 * crossUpgrade: research key that must be unlocked before the terrain can be crossed at all; until then it is impassable,
 *   but still revealed by line-of-sight so you can see the barrier.
 * exploreLength: legacy per-tile explore cost used by the old sector-exploration model; removed once droids land.
 */
export const TERRAINS = {
    home: { key: 'home', enum: 0, display: '#', label: 'Command Center', crossTime: EXPLORATION_TIME_FACTOR },
    flatland: { key: 'flatland', enum: 1, display: '*', label: 'Flatland', crossTime: EXPLORATION_TIME_FACTOR, exploreLength: EXPLORATION_TIME_FACTOR }, // Can be developed for mining
    developing: { key: 'developing', enum: 2, display: '+', label: 'Replicating', crossTime: EXPLORATION_TIME_FACTOR },
    developed: { key: 'developed', enum: 3, display: '+', label: 'Replicated', crossTime: EXPLORATION_TIME_FACTOR },
    mountain: { key: 'mountain', enum: 4, display: 'Λ', label: 'Mountain', crossTime: EXPLORATION_TIME_FACTOR * 3, crossUpgrade: 'mountaineering', exploreLength: EXPLORATION_TIME_FACTOR * 3 }, // Blocked until researched, then slow to cross
    ice: { key: 'ice', enum: 5, display: 'X', label: 'Ice', crossTime: EXPLORATION_TIME_FACTOR * 3, crossUpgrade: 'iceCrossing', exploreLength: EXPLORATION_TIME_FACTOR * 3 }, // Blocked until researched, then slow to cross
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

    // Explore adjacent sectors to base
    if (START_WITH_ADJ_EXPLORED) {
        getCoordsWithinHops([homeRow, homeCol], 1).forEach(([row, col]) => {
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
export const GRID_TERRAINS = new Set([TERRAINS.home.enum, TERRAINS.developed.enum]);

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

    const isCandidate = ([row, col]) =>
        map[row][col].terrain === TERRAINS.flatland.enum &&
        map[row][col].status === STATUSES.explored.enum;

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
export function sunTrackingRotation(fractionOfDay) {
    return mod(fractionOfDay + SUN_TRACKING_INSET, 1);
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

// overlays: { "row,col": { char, colorKey, color?, ping? } } -- markers drawn over tiles (scout droids, POIs,
// expedition squad, fight effects, path highlights). Keyed by planet coords, so they ride the rotation mapping.
export function generateImage(map, fractionOfDay, rotation, sunTracking, cookedPct, overlays = {}) {
    let nightStart = (fractionOfDay + NIGHT_START) % 1; // fraction of entire planet where nightfall starts
    let nightEnd = (fractionOfDay + NIGHT_END) % 1;

    let asciiImage = map.map((planetRow, rowIndex) => {
        const displayStart = floor(rotation * PLANET_COLS);
        const displayEnd = (displayStart + DISPLAY_COLS) % PLANET_COLS;
        let displayRow = displayStart < displayEnd ? planetRow.slice(displayStart, displayEnd) :
            planetRow.slice(displayStart, PLANET_COLS).concat(planetRow.slice(0, displayEnd));

        displayRow = displayRow.map((sector, displayColIndex) => {
            // Viewport mask: cells outside the planet silhouette draw blank; the limb fades out
            const maskFactor = DISPLAY_MASK[rowIndex][displayColIndex];
            if (maskFactor === 0) { return { char: ' ' }; }

            // Cell fields (consumed by planet_render's drawPlanetImage):
            //   char: the glyph
            //   colorKey: key into PLANET_COLORS (terrain/status key, 'droid', 'laserBeam')
            //   color: explicit color string; overrides colorKey (used by the cook sequence)
            //   light: 'day' | 'twilightDay' | 'twilightNight' | 'night' (shading level)
            //   dividers: { left, right, bottom } debug sector borders
            let char, colorKey, color, dividers;

            if (sector.status === STATUSES.unknown.enum) {
                char = STATUSES.unknown.display;
                colorKey = STATUSES.unknown.key;
            }
            else {
                char = TERRAINS_BY_ENUM[sector.terrain].display;
                colorKey = TERRAINS_BY_ENUM[sector.terrain].key;
            }

            if (sector.sectorDividerLeft || sector.sectorDividerRight || sector.sectorDividerBottom) {
                dividers = {
                    left: sector.sectorDividerLeft,
                    right: sector.sectorDividerRight,
                    bottom: sector.sectorDividerBottom
                }
            }

            let ping, alpha, offsetX, offsetY, haloEdges;
            const overlay = overlays[`${sector.coord[0]},${sector.coord[1]}`];
            if (overlay) {
                if (overlay.char) { char = overlay.char; } // color-only overlays keep the terrain glyph (e.g. path highlight)
                if (overlay.colorKey) { colorKey = overlay.colorKey; } // edge-only overlays keep the terrain color too
                if (overlay.color) { color = overlay.color; }
                ping = overlay.ping;   // radar-ping cycle; drawn as expanding rings by planet_render
                alpha = overlay.alpha; // per-cell brightness (e.g. scout pulse), multiplied with day/night shading
                offsetX = overlay.offsetX; // sub-cell nudge in cell units (squad slide/bump; see planet_render)
                offsetY = overlay.offsetY;
                haloEdges = overlay.haloEdges; // survey-boundary segments on this cell's edges (see planet_render)
            }

            let light = 'day';
            if (sunTracking) {
                // sunTracking is enabled: shading the far-right side of the planet accordingly
                // (Ideally, the sunTracking:disabled shading would work for this use case too, but I couldn't get it to
                //  work without stuttering. So I have to make this special case for sunTracking:enabled)
                const displayFraction = displayColIndex / DISPLAY_COLS; // How far into the display length the sector is
                if (displayFraction >= SUN_TRACKING_NIGHT_CUTOFF) {
                    light = 'night';
                }
                else if (displayFraction >= SUN_TRACKING_TWI_NIGHT_CUTOFF) {
                    light = 'twilightNight';
                }
                else if (displayFraction >= SUN_TRACKING_TWI_DAY_CUTOFF) {
                    light = 'twilightDay';
                }
            }
            else {
                // sunTracking is disabled: shading the night side of the planet
                const planetFraction = sector.coord[1] / PLANET_COLS; // How far into the planet length the sector is
                light = getTwilightLight(planetFraction, nightStart, nightEnd) ||
                    getNightLight(planetFraction, nightStart, nightEnd) ||
                    'day';
            }

            if (cookedPct) {
                color = getIntermediateColor(COOK_COLOR_START, COOK_COLOR_END, cookedPct)
                char = (light === 'day') ? COOKED_CHAR : TERRAINS.flatland.display;
            }

            if (maskFactor < 1) {
                alpha = (alpha === undefined ? 1 : alpha) * maskFactor; // soft limb fade
            }

            return { char, colorKey, color, light, dividers, ping, alpha, offsetX, offsetY, haloEdges }
        });

        return displayRow;
    });

    if (cookedPct) {
        asciiImage = addLaserBeams(asciiImage, fractionOfDay);
    }

    return asciiImage;
}

// There are 2 levels of twilight: a darker section is shaded towards night and a lighter section is shaded towards day.
function getTwilightLight(planetFraction, nightStart, nightEnd) {
    /**
     * nightStart is the meridian at the boundary between day and night, when night is to the right:
     *   .-----.
     *  /   |XXX\       The | line in the middle is nightStart, where X represents nighttime
     *  \   |XXX/
     *   `-----`
     * If we are within range to the left, we shade it lighter. If within range to the right, shade it darker:
     */
    if (isWithinRange(planetFraction, [nightStart - TWILIGHT_LENGTH, nightStart])) {
        return 'twilightDay';
    }
    if (isWithinRange(planetFraction, [nightStart, nightStart + TWILIGHT_LENGTH])) {
        return 'twilightNight';
    }

    /**
     * nightEnd is the meridian at the boundary between day and night, when night is to the left:
     *   .-----.
     *  /XXX|   \       The | line in the middle is nightEnd, where X represents nighttime
     *  \XXX|   /
     *   `-----`
     * If we are within range to the left, we shade it darker. If within range to the right, shade it lighter:
     */
    if (isWithinRange(planetFraction, [nightEnd - TWILIGHT_LENGTH, nightEnd])) {
        return 'twilightNight';
    }
    if (isWithinRange(planetFraction, [nightEnd, nightEnd + TWILIGHT_LENGTH])) {
        return 'twilightDay';
    }

    return ''
}


function getNightLight(planetFraction, nightStart, nightEnd) {
    if (nightStart <= nightEnd) {
        if (planetFraction >= nightStart && planetFraction < nightEnd) {
            return 'night';
        }
    }
    else {
        if (planetFraction >= nightStart || planetFraction < nightEnd) {
            return 'night';
        }
    }

    return '';
}

function isWithinRange(planetFraction, range) {
    let [rangeStart, rangeEnd] = range;
    
    if (rangeStart < 0 || rangeEnd > 1) {
        // range wraps around planet endpoints; have to use modulo
        rangeStart = mod(rangeStart, 1);
        rangeEnd = mod(rangeEnd, 1);

        if (planetFraction >= rangeStart || planetFraction < rangeEnd) {
            return true;
        }
    }
    else {
        if (planetFraction >= rangeStart && planetFraction < rangeEnd) {
            return true;
        }
    }

    return false;
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