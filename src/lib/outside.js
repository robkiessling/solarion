import {createArray, getDynamicValue, getRandomFromArray, getRandomIntInclusive, mod} from "./helpers";

import backgrounds from "../database/backgrounds";

// We want the picture to be proportionally wider
export const NUM_ROWS = 60;
export const NUM_COLS = 120; // proportional would be (5/3) * NUM_ROWS

export function generateImage(structureCounts, elapsedTime, fractionOfDay) {
    /**
     * INPUT:
     *
     * backgrounds: [
     *     { image: [[]], color: (includes opacity) } // terrain
     *     { image: [[]], color: (includes opacity) } // stars
     * ],
     * structures: {
     *     harvester: [
     *         { x: 100, y: 120, color: (includes opacity) }
     *         { x: 120, y: 130, color: (includes opacity) }
     *         // only 2 elements; so only 2 harvesters will ever be shown
     *     ],
     * },
     * doodads: {}
     */

    /**
     * OUTPUT:
     *
     * [
     *     [ ['x','rgba(1,2,3,4)'], ['y','rgba(1,2,3,5)'], ... ],
     *     [ ['x','rgba(1,2,3,4)'], ['y','rgba(1,2,3,5)'], ... ],
     *     ...
     * ]
     * canvas.js will look for strings of adjacent letters (with same color) and draw them once. it will also draw
     * each color sequentially
     */

    const result = createArray(NUM_ROWS, () => createArray(NUM_COLS, () => []));

    addBackground(result, backgrounds.stars, 0, 0, [elapsedTime, fractionOfDay]);
    addBackground(result, backgrounds.planet, 10, 0, [elapsedTime, fractionOfDay]); // todo rename terrain?

    return result;
}

// backgrounds line up with the top of the page, but get centered horizontally
function addBackground(result, background, rowOffset, colOffset, colorParams) {
    const backgroundWidth = Math.max(...background.background.map(row => row.length));
    colOffset += Math.floor(NUM_COLS / 2) - Math.floor(backgroundWidth / 2); // centers background horizontally
    const color = getDynamicValue(background.color, colorParams)

    background.background.forEach((row, rowIndex) => {
        row.split('').forEach((char, colIndex) => {
            addChar(result, rowIndex + rowOffset, colIndex + colOffset, char, color);
        })
    });
}

function addChar(result, row, col, char, color) {
    if (row >= 0 && row < NUM_ROWS && col >= 0 && col < NUM_COLS) {
        result[row][col] = [char, color];
    }
}