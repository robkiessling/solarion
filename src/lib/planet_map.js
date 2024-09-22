import {createArray, getIntermediateColor, getRandomFromArray, getRandomIntInclusive, mod} from "./helpers";


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

// const DISPLAY_ROW_LENGTHS = [7, 13, 17, 19, 21, 21, 21, 19, 17, 13, 7];
const DISPLAY_ROW_LENGTHS = [7, 17, 23, 29, 33, 35, 37, 39, 41, 41, 41, 41, 41, 39, 37, 35, 33, 29, 23, 17, 7];
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
const SUN_TRACKING_INSET = 0.05; // How much to offset rotation when sunTracking is enabled, so that you can see a little twilight
const TWILIGHT_LENGTH = 0.03; // How much each twilight region should take up

const NIGHT_START = mod(HOME_FRACTION - NIGHT_WIDTH / 2, 1); // Fraction start of night window
const NIGHT_END = mod(HOME_FRACTION + NIGHT_WIDTH / 2, 1); // Fraction end of night window
const TWILIGHT_LENGTH_DISPLAY = TWILIGHT_LENGTH * 2; // When dealing with display lengths, double the twilight length
const SUN_TRACKING_NIGHT_CUTOFF = 1 - SUN_TRACKING_INSET;
const SUN_TRACKING_TWI_NIGHT_CUTOFF = SUN_TRACKING_NIGHT_CUTOFF - TWILIGHT_LENGTH_DISPLAY;
const SUN_TRACKING_TWI_DAY_CUTOFF = SUN_TRACKING_TWI_NIGHT_CUTOFF - TWILIGHT_LENGTH_DISPLAY;

const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
// const HOME_STARTING_ROW_RANGE = [3, 7];
const HOME_STARTING_ROW_RANGE = [5, 5]; // TODO Leaving dead center otherwise first 3x3 explored area gets stretched poorly
const NUM_MOUNTAIN_RANGES_RANGE = [20, 30];
const MOUNTAIN_RANGE_SIZE_RANGE = [1, 20];

const SHOW_DEBUG_MERIDIANS = false;
const ADD_MOUNTAINS = true;
const EXPLORE_EVERYTHING = false;

const EXPLORATION_TIME_FACTOR = 10; // The fastest area takes this amount of time to explore
const START_WITH_ADJ_EXPLORED = false;

export const TERRAINS = {
    home: { key: 'home', enum: 0, display: '#', className: 'home', label: 'Command Center' },
    flatland: { key: 'flatland', enum: 1, display: '*', className: 'flatland', label: 'Flatland', exploreLength: EXPLORATION_TIME_FACTOR }, // Can be developed for mining
    developing: { key: 'developing', enum: 2, display: '+', className: 'developing', label: 'Developing' },
    developed: { key: 'developed', enum: 3, display: '+', className: 'developed', label: 'Developed' },
    mountain: { key: 'mountain', enum: 4, display: 'Λ', className: 'mountain', label: 'Mountain', exploreLength: EXPLORATION_TIME_FACTOR * 3 }, // Take 200% longer to explore, cannot be developed, high chance of mineral caves during expl.
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


export const COOK_TIME = 8000;
const COOKED_CHAR = '}'

// once cooking begins, planet color will transition from COOK_COLOR_START to COOK_COLOR_END over COOK_TIME milliseconds.
const COOK_COLOR_START = [255, 180, 0]; // rgb ffb400
const COOK_COLOR_END = [255, 60, 0]; // rgb ff3c00

const LASER_BEAM_WIDTH = 251; // needs to be odd if widest planet width is odd
const LASER_BEAM_HEIGHT = 27; // needs to be odd if planet height is odd
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

    if (ADD_MOUNTAINS) {
        addMountainRanges(map);
    }

    if (SHOW_DEBUG_MERIDIANS) {
        generateDebugMeridians(map);
    }

    const homeCoord = addHomeBase(map);

    cacheDistancesToHome(map, homeCoord);
    updateBorders(map);
    
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
        exploreLength: terrain.exploreLength,
        border: false,
    }
}

function updateBorders(map) {

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

    if (EXPLORE_EVERYTHING) {
        map.forEach((row, rowIndex) => {
            row.forEach((sector, colIndex) => {
                if (rowIndex !== map.length - 1) { // leaving 1 unexplored space for triggers
                    sector.status = STATUSES.explored.enum
                }
            });
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
// todo travel towards nearest unexplored coord (that no one else is going to?)
//      if multiple, has a bearing that it tends towards (not completely random)?
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

export function generateImage(map, fractionOfDay, cameraRotation, cookedPct) {
    let nightStart = (fractionOfDay + NIGHT_START) % 1; // fraction of entire planet where nightfall starts
    let nightEnd = (fractionOfDay + NIGHT_END) % 1;
    let percentRotated;

    if (cameraRotation === undefined) {
        // sunTracking is enabled: the camera is always from the sun's POV; the planet rotates in place

        if (DISCRETE_ROTATION) {
            // primeMeridianIndex is where the prime meridian currently is (value of 0 means it is on the left-most side of planet)
            const primeMeridianIndex = Math.floor(fractionOfDay * WIDEST_PLANET_ROW);
            percentRotated = primeMeridianIndex / WIDEST_PLANET_ROW;
        }
        else {
            percentRotated = fractionOfDay;
        }

        percentRotated = mod(percentRotated + SUN_TRACKING_INSET, 1);
    }
    else {
        // sunTracking is disabled: the camera is always centered according to user input (default is centered on home base)
        percentRotated = cameraRotation;
    }

    let asciiImage = map.map((planetRow, rowIndex) => {
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

        displayRow = displayRow.map((sector, displayColIndex) => { // todo replace sector with coord?
            let char, className, style;

            if (sector.status === STATUSES.unknown.enum) {
                char = STATUSES.unknown.display;
                className = STATUSES.unknown.className;
            }
            else {
                char = TERRAINS_BY_ENUM[sector.terrain].display;
                className = TERRAINS_BY_ENUM[sector.terrain].className;
            }

            // if (sector.status === STATUSES.exploring.enum) {
            //     className += ' exploring'
            //     const pct = `${sector.exploreProgress / (sector.exploreLength * 1000) * 100}%`
            //     style = { background: `linear-gradient(90deg, rgba(0,0,0,0) ${pct}, rgba(255,255,255,0.2) ${pct})` }
            // }

            // if (sector.status !== STATUSES.unknown.enum && getAdjacentCoords([rowIndex, sector.planetColIndex]).some(other => {
            //     return map[other[0]][other[1]].status === STATUSES.unknown.enum
            // })) {
            //     className += ' exploring'
            // }

            if (sector.status === STATUSES.exploring.enum) {
                // since we are not showing dotted exploring rect, we cannot show tile until finished (otherwise the
                // number of explored flatlands won't match up)
                char = STATUSES.unknown.display;
            }

            let isDay = true;
            if (cameraRotation === undefined) {
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
                const planetFraction = sector.planetColIndex / planetRowLength; // How far into the planet length the sector is
                const lightClass =
                    getTwilightClass(planetFraction, nightStart, nightEnd) ||
                    getNightClass(planetFraction, nightStart, nightEnd);
                className += ` ${lightClass}`;
                if (lightClass.length) { isDay = false; }
            }

            if (cookedPct) {
                char = isDay ? COOKED_CHAR : TERRAINS.flatland.display
                style = { color: getIntermediateColor(COOK_COLOR_START, COOK_COLOR_END, cookedPct) }
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
    const heightPadding = Math.floor((LASER_BEAM_HEIGHT - NUM_PLANET_ROWS) / 2);
    const widthPadding = Math.floor((LASER_BEAM_WIDTH - WIDEST_DISPLAY_ROW) / 2);

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
            const dayOffset = (Math.floor(fractionOfDay * sumLength * LASER_BEAM_SPEED)) % sumLength;
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
