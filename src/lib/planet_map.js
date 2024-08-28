import {createArray, getRandomFromArray, getRandomIntInclusive, mod} from "./helpers";


// TODO The planet layout currently is like a football. This causes things to get stretched weirdly, we need to
//      implement something like a globe split into slices if we want to reduce the amount of distortion
// const PLANET_LAYOUT = [
//               '··············',
//         '··························',
//     '··········ΛΛ*····Λ················',
//   '··········ΛΛΛΛ*···*ΛΛΛ················',
// '····****··ΛΛΛ*****··***ΛΛ·*····Λ****······',
// '·····****·Λ***********+++***··***Λ········',
// '·······***************++++++*****Λ········',
//   '·········*********+++++@++****········',
//     '··········*****+++Λ++++++*Λ·······',
//         '·······********ΛΛ**··***··',
//               '····******····'
// ];
// const PLANET_ROW_LENGTHS = PLANET_LAYOUT.map(row => row.length);
// const DISPLAY_ROW_LENGTHS = PLANET_ROW_LENGTHS.map(size => Math.round(size / 2)); // only half the planet is visible at once

const DISPLAY_ROW_LENGTHS = [7, 13, 17, 19, 21, 21, 21, 19, 17, 13, 7];
const PLANET_ROW_LENGTHS = DISPLAY_ROW_LENGTHS.map(length => length * 2); // Display only shows half of real planet
const NUM_PLANET_ROWS = PLANET_ROW_LENGTHS.length;

const WIDEST_PLANET_ROW = Math.max(...PLANET_ROW_LENGTHS);
const WIDEST_DISPLAY_ROW = Math.max(...DISPLAY_ROW_LENGTHS);
export const NUM_SECTORS = PLANET_ROW_LENGTHS.reduce((a, b) => a + b, 0);

// If true, each rotation step will occur an equal amount of time apart. Only some rows will move though because some
//   rows have farther to move than others.
// If false, rows can move independently (looks better at high rotation rates, but at low rates it can be jarring)
const DISCRETE_ROTATION = true;

const HOME_FRACTION = 0.75; // Defining home to be 75% of the way into planet, this way it lines up with 50% on slider
const NIGHT_WIDTH = 0.45; // How much of the planet night should occupy
const SUN_TRACKING_INSET = 0.15; // How much to offset rotation when sunTracking is enabled, so that you can see a little twilight
const TWILIGHT_LENGTH = 0.03; // How much each twilight region should take up

const NIGHT_START = mod(HOME_FRACTION - NIGHT_WIDTH / 2, 1); // Fraction start of night window
const NIGHT_END = mod(HOME_FRACTION + NIGHT_WIDTH / 2, 1); // Fraction end of night window

const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
// const HOME_STARTING_ROW_RANGE = [3, 7];
const HOME_STARTING_ROW_RANGE = [5, 5]; // TODO Leaving dead center otherwise first 3x3 explored area gets stretched poorly
const NUM_MOUNTAIN_RANGES_RANGE = [8, 10];
const MOUNTAIN_RANGE_SIZE_RANGE = [1, 10];

const SHOW_DEBUG_MERIDIANS = false;
const ADD_MOUNTAINS = true;

const EXPLORATION_TIME_FACTOR = 30; // The fastest area takes this amount of time to explore
const START_WITH_ADJ_EXPLORED = false;

export const TERRAINS = {
    home: { key: 'home', enum: 0, display: 'T', className: 'home', label: 'Command Center' },
    flatland: { key: 'flatland', enum: 1, display: '*', className: 'flatland', label: 'Flatland', exploreLength: EXPLORATION_TIME_FACTOR }, // Can be developed for mining
    developed: { key: 'developed', enum: 2, display: '+', className: 'developed', label: 'Developed' },
    mountain: { key: 'mountain', enum: 3, display: 'Λ', className: 'mountain', label: 'Mountain', exploreLength: EXPLORATION_TIME_FACTOR * 3 }, // Take 200% longer to explore, cannot be developed, high chance of mineral caves during expl.
}

if (SHOW_DEBUG_MERIDIANS) {
    _.merge(TERRAINS, {
        m0: { key: 'm0', enum: 100, display: '0', exploreLength: EXPLORATION_TIME_FACTOR },
        m1: { key: 'm1', enum: 101, display: '1', exploreLength: EXPLORATION_TIME_FACTOR },
        m2: { key: 'm2', enum: 102, display: '2', exploreLength: EXPLORATION_TIME_FACTOR },
        m3: { key: 'm3', enum: 103, display: '3', exploreLength: EXPLORATION_TIME_FACTOR },
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

export function generateRandomMap() {
    const map = [];

    // Start by initializing entire map as flatland
    PLANET_ROW_LENGTHS.forEach(rowLength => {
        map.push(createArray(rowLength, () => createSector(TERRAINS.flatland, STATUSES.unknown)));
    });

    if (ADD_MOUNTAINS) {
        addMountainRanges(map);
    }

    if (SHOW_DEBUG_MERIDIANS) {
        generateDebugMeridians(map);
    }

    const homeCoord = addHomeBase(map);

    cacheDistancesToHome(map, homeCoord);
    
    return map;
}

function generateDebugMeridians(map, numMeridians = 4) {
    PLANET_ROW_LENGTHS.forEach((rowLength, rowIndex) => {
        let meridians = [];
        for (let colIndex = 0; colIndex < numMeridians; colIndex++) {
            meridians.push(Math.floor(rowLength * colIndex / numMeridians));
        }

        for (let colIndex = 0; colIndex < rowLength; colIndex++) {
            let meridianIndex = meridians.indexOf(colIndex);
            if (meridianIndex !== -1) {
                map[rowIndex][colIndex] = createSector(TERRAINS[`m${meridianIndex}`], STATUSES.explored);
            }
        }
    });
}

function createSector(terrain, status) {
    return {
        terrain: terrain.enum,
        status: status.enum,
        exploreLength: terrain.exploreLength
    }
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

// Each mountain range is aimed at a random primary direction. As the range is built, it will have a high
// chance of heading in the primary direction, a smaller chance of heading in the secondary direction
// (e.g. if primary is E, secondary directions are NE/SE), and a small chance of heading in a random direction.
function addMountainRange(map, size, startingRow, startingCol) {
    const primaryDirection = getRandomFromArray(DIRECTIONS);
    const secondaryDirections = primaryDirection.length === 2 ? primaryDirection.split('') :
        DIRECTIONS.filter(dir => dir.length === 2 && dir.includes(primaryDirection));

    let currentCoord = [startingRow, startingCol];

    for (let step = 0; step < size; step++) {
        map[currentCoord[0]][currentCoord[1]] = createSector(TERRAINS.mountain, STATUSES.unknown);

        // Choose next direction
        let direction;
        const rand = Math.random();
        if (rand < 0.4) { direction = primaryDirection; }
        else if (rand < 0.7) { direction = getRandomFromArray(secondaryDirections); }
        else { direction = getRandomFromArray(DIRECTIONS); }

        // Move towards the randomly chosen direction
        switch(direction) {
            case 'N': currentCoord = getCoordAtOffset(currentCoord, -1, 0) || currentCoord; break;
            case 'NE': currentCoord = getCoordAtOffset(currentCoord, -1, 1) || currentCoord; break;
            case 'E': currentCoord = getCoordAtOffset(currentCoord, 0, 1) || currentCoord; break;
            case 'SE': currentCoord = getCoordAtOffset(currentCoord, 1, 1) || currentCoord; break;
            case 'S': currentCoord = getCoordAtOffset(currentCoord, 1, 0) || currentCoord; break;
            case 'SW': currentCoord = getCoordAtOffset(currentCoord, 1, -1) || currentCoord; break;
            case 'W': currentCoord = getCoordAtOffset(currentCoord, 0, -1) || currentCoord; break;
            case 'NW': currentCoord = getCoordAtOffset(currentCoord, -1, -1) || currentCoord; break;
        }
    }
}

function addHomeBase(map) {
    const homeRow = getRandomIntInclusive(...HOME_STARTING_ROW_RANGE);
    const homeCol = Math.floor(HOME_FRACTION * PLANET_ROW_LENGTHS[homeRow]);

    if (ADD_MOUNTAINS) {
        // Create a mountain range near to home (so it somewhat matches the scenery)
        addMountainRange(map, 5, homeRow, homeCol);
    }

    // Add home
    map[homeRow][homeCol] = createSector(TERRAINS.home, STATUSES.explored);

    // Explore adjacent sectors to base
    if (START_WITH_ADJ_EXPLORED) {
        getAdjacentCoords([homeRow, homeCol]).forEach(([row, col]) => {
            map[row][col].status = STATUSES.explored.enum
        });
    }

    return [homeRow, homeCol]
}

function getAdjacentCoords(coord) {
    return [
        [-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1]
    ].map(([row, col]) => getCoordAtOffset(coord, row, col)).filter(coord => coord !== null)
}

// Returns an array of all unknown coordinates adjacent to an explored coord
function getAdjacentUnknownCoords(map) {
    const adjCoords = [];

    map.forEach((row, rowIndex) => {
        row.forEach((sector, colIndex) => {
            if (sector.status === STATUSES.explored.enum) {
                getAdjacentCoords([rowIndex, colIndex]).forEach(coord => {
                    if (map[coord[0]][coord[1]].status === STATUSES.unknown.enum) {
                        adjCoords.push(coord);
                    }
                })
            }
        });
    });

    return _.uniqWith(adjCoords, _.isEqual);
}

function getCoordAtOffset(startingCoord, rowOffset, colOffset) {
    let newRow = startingCoord[0] + rowOffset;
    if (newRow < 0 || newRow >= NUM_PLANET_ROWS) {
        return null; // Cannot pass north/south edge
    }

    // Because planet is rounded, each row can have a different number of columns. So when moving north/south,
    // have to take into account this planet curvature
    let startingColAdjusted = startingCoord[1] + (WIDEST_PLANET_ROW - PLANET_ROW_LENGTHS[startingCoord[0]]) / 2;
    let newCol = startingColAdjusted - (WIDEST_PLANET_ROW - PLANET_ROW_LENGTHS[newRow]) / 2;

    // Column can wrap around from last index to first
    newCol = mod(newCol + colOffset, PLANET_ROW_LENGTHS[newRow]);

    return [newRow, newCol];
}

function getDistanceBetweenCoords(coord1, coord2) {
    const coord1Row = coord1[0];
    const coord2Row = coord2[0];
    const rowOffset = Math.abs(coord2Row - coord1Row);

    const coord1Col = coord1[1] + (WIDEST_PLANET_ROW - PLANET_ROW_LENGTHS[coord1Row]) / 2;
    const coord2Col = coord2[1] + (WIDEST_PLANET_ROW - PLANET_ROW_LENGTHS[coord2Row]) / 2;
    const standardColOffset = Math.abs(coord2Col - coord1Col);

    const longerRowLength = Math.max(PLANET_ROW_LENGTHS[coord1Row], PLANET_ROW_LENGTHS[coord2Row]);
    const altColOffset = longerRowLength - standardColOffset;
    const colOffset = Math.min(standardColOffset, altColOffset);

    // This is not the same as triangular distance (sqrt(a^2 + b^2)); we have to weigh the row distance more heavily
    // because text characters are taller than they are wide. No need to sqrt because we just care about distance ratios
    return rowOffset**(1.5) + colOffset;
}

function cacheDistancesToHome(map, homeCoord) {
    map.forEach((row, rowIndex) => {
        row.forEach((sector, colIndex) => {
            sector.distanceHome = getDistanceBetweenCoords(homeCoord, [rowIndex, colIndex]);
        });
    });
}

// Find an unknown sector adjacent to current explored area
export function getNextExplorableSector(map) {
    // --- Finds any adjacent unexplored space (purely random searching)
    // const coord = getRandomFromArray(getAdjacentUnknownCoords(map))
    // return coord === undefined ? [undefined, undefined] : coord;

    // --- Finds closest unexplored space to home
    let minDistance;
    let closestCoords = [];
    map.forEach((row, rowIndex) => {
        row.forEach((sector, colIndex) => {
            if (sector.status === STATUSES.unknown.enum) {
                const distance = sector.distanceHome;
                if (minDistance === undefined || distance < minDistance) {
                    minDistance = distance;
                    closestCoords = [[rowIndex, colIndex]];
                }
                else if (distance === minDistance) {
                    closestCoords.push([rowIndex, colIndex]);
                }
            }
        });
    });
    const coord = getRandomFromArray(closestCoords);
    return coord === undefined ? [undefined, undefined] : coord;
}

export function mapIsFullyExplored(map) {
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

export function generateImage(map, fractionOfDay, cameraRotation) {
    let nightStart = (fractionOfDay + NIGHT_START) % 1; // fraction of entire planet where nightfall starts
    let nightEnd = (fractionOfDay + NIGHT_END) % 1;
    let percentRotated;

    if (cameraRotation === undefined) {
        // sunTracking is enabled

        if (DISCRETE_ROTATION) {
            // primeMeridianIndex is where the prime meridian currently is (value of 0 means it is on the left-most side of planet)
            const primeMeridianIndex = Math.floor(fractionOfDay * WIDEST_PLANET_ROW);
            percentRotated = primeMeridianIndex / WIDEST_PLANET_ROW;
        }
        else {
            percentRotated = fractionOfDay;
        }

        percentRotated = mod(percentRotated + SUN_TRACKING_INSET, 1);
        // console.log(percentRotated);
    }
    else {
        // No sunTracking; rotate according to user input
        percentRotated = cameraRotation;
    }

    // Flicker tiles that are being explored by showing/hiding a border around it
    // todo this is not actually thousandths, and it needs to be proportional to DAY_LENGTH
    // let thousandths = Math.floor(fractionOfDay * 1000 % 20);
    // const flicker = (thousandths >= 0 && thousandths < 5) || (thousandths >= 10 && thousandths < 15)
    const flicker = true;

    return map.map((planetRow, rowIndex) => {
        const planetRowLength = PLANET_ROW_LENGTHS[rowIndex];
        const displayRowLength = DISPLAY_ROW_LENGTHS[rowIndex];

        // Cache what index of the planet the sector is at (once we slice it later into a displayRow we can't get this anymore)
        planetRow = planetRow.map((sector, planetColIndex) => {
            return Object.assign({}, sector, { planetColIndex: planetColIndex })
        });

        const displayStart = Math.floor(percentRotated * planetRowLength);
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

            if (sector.status === STATUSES.exploring.enum && flicker) {
            // if (sector.status === STATUSES.exploring.enum) {
                className += ' exploring'
                const pct = `${sector.exploreProgress / (sector.exploreLength * 1000) * 100}%`
                style = { background: `linear-gradient(90deg, rgba(0,0,0,0) ${pct}, rgba(255,255,255,0.2) ${pct})` }
            }

            // How far into the planet length the sector is
            const planetFraction = sector.planetColIndex / planetRowLength;
            const lightClass =
                getTwilightClass(planetFraction, nightStart, nightEnd) ||
                getNightClass(planetFraction, nightStart, nightEnd);
            className += ` ${lightClass}`;

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

        if (planetFraction >= rangeStart || planetFraction <= rangeEnd) {
            return true;
        }
    }
    else {
        if (planetFraction >= rangeStart && planetFraction <= rangeEnd) {
            return true;
        }
    }

    return false;
}
