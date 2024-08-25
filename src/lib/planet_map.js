import {createArray, getRandomFromArray, getRandomIntInclusive, mod} from "./helpers";

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

export const HOME_BASE = '@';
export const UNKNOWN = '·';
export const MOUNTAIN = 'Λ'; // Take 200% longer to explore, cannot be developed, high chance of mineral caves during expl.
export const FLATLAND = '*'; // Can be developed for mining
export const DEVELOPED = '+';

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

const TWILIGHT_PCT = 0.7; // Section of planet to shade as twilight
const DARKNESS_PCT = 0.85; // Section of planet to shade as darkness

const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const HOME_STARTING_ROW_RANGE = [3, 7];
const NUM_MOUNTAIN_RANGES_RANGE = [8, 10];
const MOUNTAIN_RANGE_SIZE_RANGE = [1, 10];

export function generateRandomMap() {
    const map = [];

    // Start by initializing entire map as flatland
    PLANET_ROW_LENGTHS.forEach(rowLength => {
        map.push(createArray(rowLength, FLATLAND));
    });

    addMountainRanges(map);
    addHomeBase(map);
    
    return map;
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
        map[currentCoord[0]][currentCoord[1]] = MOUNTAIN;

        // Choose next direction
        let direction;
        const rand = Math.random();
        if (rand < 0.4) { direction = primaryDirection; }
        else if (rand < 0.7) { direction = getRandomFromArray(secondaryDirections); }
        else { direction = getRandomFromArray(DIRECTIONS); }

        // Move towards the randomly chosen direction
        switch(direction) {
            case 'N': currentCoord = getCoordAtOffset(currentCoord, -1, 0); break;
            case 'NE': currentCoord = getCoordAtOffset(currentCoord, -1, 1); break;
            case 'E': currentCoord = getCoordAtOffset(currentCoord, 0, 1); break;
            case 'SE': currentCoord = getCoordAtOffset(currentCoord, 1, 1); break;
            case 'S': currentCoord = getCoordAtOffset(currentCoord, 1, 0); break;
            case 'SW': currentCoord = getCoordAtOffset(currentCoord, 1, -1); break;
            case 'W': currentCoord = getCoordAtOffset(currentCoord, 0, -1); break;
            case 'NW': currentCoord = getCoordAtOffset(currentCoord, -1, -1); break;
        }
    }
}

function addHomeBase(map) {
    const homeRow = getRandomIntInclusive(...HOME_STARTING_ROW_RANGE);
    const homeCol = Math.round((TWILIGHT_PCT - 0.1) * PLANET_ROW_LENGTHS[homeRow]); // So home leaves twilight at ~6am

    addMountainRange(map, 5, homeRow, homeCol); // Always have a mountain near to base (so matches scenery)

    map[homeRow][homeCol] = HOME_BASE;
}

function getCoordAtOffset(startingCoord, rowOffset, colOffset) {
    let newRow = startingCoord[0] + rowOffset;
    newRow = Math.max(newRow, 0); // Do not pass north edge
    newRow = Math.min(newRow, NUM_PLANET_ROWS - 1); // Do not pass south edge

    // Because planet is rounded, each row can have a different number of columns. So when moving north/south,
    // have to take into account this planet curvature
    let startingColWithOffset = startingCoord[1] + (WIDEST_PLANET_ROW - PLANET_ROW_LENGTHS[startingCoord[0]]) / 2;
    let newCol = startingColWithOffset - (WIDEST_PLANET_ROW - PLANET_ROW_LENGTHS[newRow]) / 2;

    // Column can wrap around from last index to first
    newCol = mod(newCol + colOffset, PLANET_ROW_LENGTHS[newRow]);

    return [newRow, newCol];
}

export function generateImage(map, fractionOfDay) {
    let percentRotated;

    if (DISCRETE_ROTATION) {
        // where the prime meridian currently is (value of 0 means it is on the left-most side of planet)
        const primeMeridianIndex = Math.floor(fractionOfDay * WIDEST_PLANET_ROW);
        percentRotated = primeMeridianIndex / WIDEST_PLANET_ROW;
    }
    else {
        percentRotated = fractionOfDay;
    }

    return map.map((planetRow, rowIndex) => {
        const planetRowLength = PLANET_ROW_LENGTHS[rowIndex];
        const displayRowLength = DISPLAY_ROW_LENGTHS[rowIndex]

        const startIndex = Math.floor(percentRotated * planetRowLength);
        const endIndex = (startIndex + displayRowLength) % planetRowLength;

        let displayRow;
        if (startIndex < endIndex) {
            displayRow = planetRow.slice(startIndex, endIndex);
        }
        else {
            displayRow = planetRow.slice(startIndex, planetRowLength).concat(planetRow.slice(0, endIndex));
        }

        const missingSpaces = (WIDEST_DISPLAY_ROW - displayRowLength) / 2;
        return displayRow.join('').padStart(displayRowLength + missingSpaces, ' ').split('').map((char, charIndex) => {
            charIndex -= missingSpaces;

            let color = '';
            switch(char) {
                case HOME_BASE:
                    color += 'home';
                    break;
                case UNKNOWN:
                    color += 'unknown';
                    break;
                case MOUNTAIN:
                    color += 'mountain';
                    break;
                case FLATLAND:
                    color += 'flatland';
                    break;
                case DEVELOPED:
                    color += 'developed';
                    break;
            }

            if (charIndex >= TWILIGHT_PCT * displayRowLength) { color += ' twilight'; }
            if (charIndex >= DARKNESS_PCT * displayRowLength) { color += ' darkness'; }

            return {
                char: char,
                color: color
            }
        })
    });
}

