import _ from 'lodash';
import {createArray, getIntermediateColor, getRandomFromArray, getRandomIntInclusive, mod, floor, nTimes} from "./helpers";
import {
    ALL_DIRECTIONS,
    COORD_TO_MERIDIAN_LOOKUP,
    DISPLAY_ROW_LENGTHS,
    meridianStepInDirection,
    getCoordsWithinHops,
    getApproxDistance,
    getGraphDistancesFrom,
    MERIDIANS,
    NUM_PLANET_ROWS,
    PLANET_ROW_LENGTHS,
    WIDEST_DISPLAY_ROW,
    WIDEST_PLANET_ROW,
} from "./planet_geometry";

// Re-exported so existing consumers (e.g. redux) can keep importing planet-size constants from here.
// The source of truth lives in planet_geometry.
export { NUM_SECTORS } from "./planet_geometry";


/**
 * If DISCRETE_ROTATION is true, each rotation step will occur an equal amount of time apart. Only some rows will
 * move though because some rows have farther to move than others.
 *
 * If false, rows can move independently (looks better at high rotation rates, but at low rates it can be jarring)
 */
const DISCRETE_ROTATION = true;

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


// Ice cap is hardcoded to these values
const NORTH_ICE_CAP_ROWS = [
    [20], // row 0 
    [8, 2, 7, 2, 11, 1, 30], // row 1 (8 sectors of ice, followed by a 2 sector gap, followed by 7 sectors of ice, etc.)
    [0, 7, 3, 20, 7, 30] // row 2
]
const SOUTH_ICE_CAP_ROWS = [
    [0, 9, 5, 22, 7, 30], // third to last row
    [0, 2, 16, 2, 30], // second to last row
    [20] // last row
]

// const HOME_STARTING_ROW_RANGE = [3, 7];
const HOME_STARTING_ROW_RANGE = [5, 5]; // TODO Leaving dead center otherwise first 3x3 explored area gets stretched poorly
const NUM_MOUNTAIN_RANGES_RANGE = [40, 50];
const MOUNTAIN_RANGE_SIZE_RANGE = [1, 20];

const SHOW_DEBUG_MERIDIANS = false;
const NUM_DEBUG_MERIDIANS = 8;
const ADD_MOUNTAINS = true;
const EXPLORE_EVERYTHING = false;
const MARK_SECTORS = false;
const LOG_MAP = false;

const EXPLORATION_TIME_FACTOR = 5; // The fastest area takes this amount of time to explore
const START_WITH_ADJ_EXPLORED = true;

/**
 * crossTime: ms for a droid to cross one tile of this terrain (the movement cost / terrain weight).
 * crossUpgrade: research key that must be unlocked before the terrain can be crossed at all; until then it is impassable,
 *   but still revealed by line-of-sight so you can see the barrier.
 * exploreLength: legacy per-tile explore cost used by the old sector-exploration model; removed once droids land.
 */
export const TERRAINS = {
    home: { key: 'home', enum: 0, display: '#', className: 'home', label: 'Command Center', crossTime: EXPLORATION_TIME_FACTOR },
    flatland: { key: 'flatland', enum: 1, display: '*', className: 'flatland', label: 'Flatland', crossTime: EXPLORATION_TIME_FACTOR, exploreLength: EXPLORATION_TIME_FACTOR }, // Can be developed for mining
    developing: { key: 'developing', enum: 2, display: '+', className: 'developing', label: 'Replicating', crossTime: EXPLORATION_TIME_FACTOR },
    developed: { key: 'developed', enum: 3, display: '+', className: 'developed', label: 'Replicated', crossTime: EXPLORATION_TIME_FACTOR },
    mountain: { key: 'mountain', enum: 4, display: 'Λ', className: 'mountain', label: 'Mountain', crossTime: EXPLORATION_TIME_FACTOR * 3, crossUpgrade: 'mountaineering', exploreLength: EXPLORATION_TIME_FACTOR * 3 }, // Blocked until researched, then slow to cross
    ice: { key: 'ice', enum: 5, display: 'X', className: 'ice', label: 'Ice', crossTime: EXPLORATION_TIME_FACTOR * 3, crossUpgrade: 'iceCrossing', exploreLength: EXPLORATION_TIME_FACTOR * 3 }, // Blocked until researched, then slow to cross
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
    unknown: { key: 'unknown', enum: 0, display: '·', className: 'unknown', label: 'Unknown' },
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

const LASER_BEAM_WIDTH = 251; // needs to be odd if widest planet width is odd
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
    PLANET_ROW_LENGTHS.forEach(rowLength => {
        map.push(createArray(rowLength, () => createSector(TERRAINS.flatland, STATUSES.unknown)));
    });

    if (ADD_MOUNTAINS) addMountainRanges(map);

    // addIceCaps(map);

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
        const rowLength = PLANET_ROW_LENGTHS[rowIndex];
        const padding = Math.floor((WIDEST_PLANET_ROW - rowLength) / 2);
        nTimes(padding, () => str += ' ');
        row.forEach(sector => {
            str += TERRAINS_BY_ENUM[sector.terrain].display;
        });
        nTimes(padding, () => str += ' ');
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
    for (let i = 0; i < NUM_SECTOR_MERIDIANS; i++) {
        const middleRow = floor(NUM_PLANET_ROWS / 2) - 1
        const colIndexInMiddleRow = floor(i / NUM_SECTOR_MERIDIANS * PLANET_ROW_LENGTHS[middleRow]);
        const meridianIndex = COORD_TO_MERIDIAN_LOOKUP[middleRow][colIndexInMiddleRow];

        MERIDIANS[meridianIndex].forEach((colIndex, rowIndex) => {
            map[rowIndex][colIndex].sectorDividerLeft = true;

            const prevCol = mod(colIndex - 1, PLANET_ROW_LENGTHS[rowIndex]);
            map[rowIndex][prevCol].sectorDividerRight = true;
        })
    }

    // const middleRow = floor(NUM_PLANET_ROWS / 2) - 1
    // for (let i = 0; i < PLANET_ROW_LENGTHS[middleRow]; i++) {
    //     map[middleRow][i].sectorDividerBottom = true
    // }
    const firstThird = floor(NUM_PLANET_ROWS / 3) - 1
    for (let i = 0; i < PLANET_ROW_LENGTHS[firstThird]; i++) {
        map[firstThird][i].sectorDividerBottom = true
    }
    const secondThird = floor(NUM_PLANET_ROWS / 3 * 2) - 1
    for (let i = 0; i < PLANET_ROW_LENGTHS[secondThird]; i++) {
        map[secondThird][i].sectorDividerBottom = true
    }
}

/**
 * Draws some of the meridian lines on the map to help with debugging.
 * We have lots of meridians (equal to the widest row), so note that we are just drawing a subset of them.
 * E.g. if the widest row is length 80 and numMeridians is 4, every 20th meridian will be drawn
 */
function generateDebugMeridians(map) {
    for (let i = 0; i < NUM_DEBUG_MERIDIANS; i++) {
        const middleRow = floor(NUM_PLANET_ROWS / 2)
        const colIndexInMiddleRow = floor(i / NUM_DEBUG_MERIDIANS * PLANET_ROW_LENGTHS[middleRow]);
        const meridianIndex = COORD_TO_MERIDIAN_LOOKUP[middleRow][colIndexInMiddleRow];

        MERIDIANS[meridianIndex].forEach((colIndex, rowIndex) => {
            if (map[rowIndex][colIndex].terrain < 100) {
                map[rowIndex][colIndex] = createSector(TERRAINS[`meridian_${i}`], STATUSES.explored);
            }
        })
    }

    const middleRow = floor(NUM_PLANET_ROWS / 2)
    for (let i = 0; i < PLANET_ROW_LENGTHS[middleRow]; i++) {
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
            if (colIndex + i < PLANET_ROW_LENGTHS[rowIndex]) {
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
        const mountainRangeStartCol = getRandomIntInclusive(0, PLANET_ROW_LENGTHS[mountainRangeStartRow] - 1);
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

    for (let step = 0; step < size; step++) {
        map[currentCoord[0]][currentCoord[1]] = createSector(TERRAINS.mountain, STATUSES.unknown);

        // Choose next direction
        let direction;
        const rand = Math.random();
        if (rand < 0.4) { direction = primaryDirection; }
        else if (rand < 0.7) { direction = getRandomFromArray(secondaryDirections); }
        else { direction = getRandomFromArray(ALL_DIRECTIONS); }

        // Move towards the randomly chosen direction (if possible)
        currentCoord = meridianStepInDirection(currentCoord, direction) || currentCoord;
    }
}

function addHomeBase(map) {
    const homeRow = getRandomIntInclusive(...HOME_STARTING_ROW_RANGE);
    const homeCol = floor(HOME_FRACTION * PLANET_ROW_LENGTHS[homeRow]);

    if (ADD_MOUNTAINS) {
        // Create a mountain range near to home (so it somewhat matches the scenery)
        addMountainRange(map, 5, homeRow, homeCol);
    }

    // Add home
    map[homeRow][homeCol] = createSector(TERRAINS.home, STATUSES.explored);

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

// returns array of coords to develop
export function getNextDevelopmentArea(map, size) {
    let closestCoords = [];
    map.forEach((row, rowIndex) => {
        row.forEach((sector, colIndex) => {
            if (sector.terrain === TERRAINS.flatland.enum) {
                closestCoords.push({
                    coord: [rowIndex, colIndex],
                    distanceHome: sector.distanceHome
                })
            }
        });
    });

    return _.sortBy(closestCoords, [coordWithDistance => coordWithDistance.distanceHome])
        .slice(0, size)
        .map(coordWithDistance => coordWithDistance.coord)
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
    let rotation;

    if (DISCRETE_ROTATION) {
        // primeMeridianIndex is where the prime meridian currently is (value of 0 means it is on the left-most side of planet)
        const primeMeridianIndex = floor(fractionOfDay * WIDEST_PLANET_ROW);
        rotation = primeMeridianIndex / WIDEST_PLANET_ROW;
    }
    else {
        rotation = fractionOfDay;
    }

    return mod(rotation + SUN_TRACKING_INSET, 1);
}

export function generateImage(map, fractionOfDay, rotation, sunTracking, cookedPct) {
    let nightStart = (fractionOfDay + NIGHT_START) % 1; // fraction of entire planet where nightfall starts
    let nightEnd = (fractionOfDay + NIGHT_END) % 1;

    let asciiImage = map.map((planetRow, rowIndex) => {
        const planetRowLength = PLANET_ROW_LENGTHS[rowIndex];
        const displayRowLength = DISPLAY_ROW_LENGTHS[rowIndex];

        const displayStart = floor(rotation * planetRowLength);
        const displayEnd = (displayStart + displayRowLength) % planetRowLength;
        let displayRow = displayStart < displayEnd ? planetRow.slice(displayStart, displayEnd) :
            planetRow.slice(displayStart, planetRowLength).concat(planetRow.slice(0, displayEnd));

        displayRow = displayRow.map((sector, displayColIndex) => {
            let char, className, style;

            if (sector.status === STATUSES.unknown.enum) {
                char = STATUSES.unknown.display;
                className = STATUSES.unknown.className;
            }
            else {
                char = TERRAINS_BY_ENUM[sector.terrain].display;
                className = TERRAINS_BY_ENUM[sector.terrain].className;
            }

            if (sector.status === STATUSES.exploring.enum) {
                className += ' exploring'
                const pct = `${sector.exploreProgress / (sector.exploreLength * 1000) * 100}%`
                style = { background: `linear-gradient(90deg, rgba(0,0,0,0) ${pct}, rgba(255,255,255,0.2) ${pct})` }
            }

            // if (sector.status !== STATUSES.unknown.enum && getAdjacentCoords([rowIndex, sector.planetColIndex]).some(other => {
            //     return map[other[0]][other[1]].status === STATUSES.unknown.enum
            // })) {
            //     className += ' exploring'
            // }

            if (sector.sectorDividerLeft) { className += ' sector-divider-left' }
            if (sector.sectorDividerRight) { className += ' sector-divider-right' }
            if (sector.sectorDividerBottom) { className += ' sector-divider-bottom' }

            if (sector.status === STATUSES.exploring.enum) {
                // since we are not showing dotted exploring rect, we cannot show tile until finished (otherwise the
                // number of explored flatlands won't match up)
                char = STATUSES.unknown.display;
            }

            let isDay = true;
            if (sunTracking) {
                // sunTracking is enabled: shading the far-right side of the planet accordingly
                // (Ideally, the sunTracking:disabled shading would work for this use case too, but I couldn't get it to
                //  work without stuttering. So I have to make this special case for sunTracking:enabled)
                const displayFraction = displayColIndex / displayRowLength; // How far into the display length the sector is
                if (displayFraction >= SUN_TRACKING_NIGHT_CUTOFF) {
                    className += ' night';
                    isDay = false;
                }
                else if (displayFraction >= SUN_TRACKING_TWI_NIGHT_CUTOFF) {
                    className += ' twilight-night';
                    isDay = false;
                }
                else if (displayFraction >= SUN_TRACKING_TWI_DAY_CUTOFF) {
                    className += ' twilight-day';
                    isDay = false;
                }
            }
            else {
                // sunTracking is disabled: shading the night side of the planet
                // TODO This performance is really bad
                const planetFraction = sector.coord[1] / planetRowLength; // How far into the planet length the sector is
                const lightClass =
                    getTwilightClass(planetFraction, nightStart, nightEnd) ||
                    getNightClass(planetFraction, nightStart, nightEnd);
                // className += ` ${lightClass}`;
                if (lightClass.length) { isDay = false; }
            }

            if (cookedPct) {
                const cookedColor = getIntermediateColor(COOK_COLOR_START, COOK_COLOR_END, cookedPct)
                if (isDay) {
                    // if (char !== TERRAINS.mountain.display) {
                        char = COOKED_CHAR;
                        style = { color: cookedColor }
                    // }
                }
                else {
                    char = TERRAINS.flatland.display
                    style = { color: cookedColor }
                }
            }

            return {
                char: char,
                className: className,
                style: style
            }
        });

        const numMissingSpaces = (WIDEST_DISPLAY_ROW - displayRowLength) / 2;
        displayRow.unshift(...createArray(numMissingSpaces, () => ({ char: ' ' })))
        return displayRow;
    });

    if (cookedPct) {
        asciiImage = addLaserBeams(asciiImage, fractionOfDay);
    }

    return asciiImage;
}

// There are 2 levels of twilight: a darker section is shaded towards night and a lighter section is shaded towards day.
function getTwilightClass(planetFraction, nightStart, nightEnd) {
    /**
     * nightStart is the meridian at the boundary between day and night, when night is to the right:
     *   .-----.
     *  /   |XXX\       The | line in the middle is nightStart, where X represents nighttime
     *  \   |XXX/
     *   `-----`
     * If we are within range to the left, we shade it lighter. If within range to the right, shade it darker:
     */
    if (isWithinRange(planetFraction, [nightStart - TWILIGHT_LENGTH, nightStart])) {
        return 'twilight-day';
    }
    if (isWithinRange(planetFraction, [nightStart, nightStart + TWILIGHT_LENGTH])) {
        return 'twilight-night';
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
        return 'twilight-night';
    }
    if (isWithinRange(planetFraction, [nightEnd, nightEnd + TWILIGHT_LENGTH])) {
        return 'twilight-day';
    }

    return ''
}


function getNightClass(planetFraction, nightStart, nightEnd) {
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
    const widthPadding = floor((LASER_BEAM_WIDTH - WIDEST_DISPLAY_ROW) / 2);

    // start by making a 2d array of beams
    let result = createArray(LASER_BEAM_HEIGHT, (rowIndex) => {
        const char = LASER_BEAM_LINE_CHARS[rowIndex];

        // initialize beam as a long array of beam chars
        const row = createArray(LASER_BEAM_WIDTH, () => {
            return {
                char: char,
                className: 'laser-beam'
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
            const {char, className, style} = sector;
            const netRowIndex = heightPadding + rowIndex;

            if (char === ' ') { return; }

            // if there is a streak, we do not apply the planet image for that streak part
            if (LASER_BEAM_STREAKS[netRowIndex] && colIndex <= LASER_BEAM_STREAKS[netRowIndex]) { return; }

            result[netRowIndex][widthPadding + colIndex] = sector
        });
    })

    return result;
}