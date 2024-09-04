import {createArray, getDynamicValue, getRandomFromArray, getRandomIntInclusive, mod} from "./helpers";

import backgrounds from "../database/backgrounds";
import { structures, doodads } from '../database/animations'

// We want the picture to be proportionally wider
export const NUM_ROWS = 60;
export const NUM_COLS = 120; // proportional would be (5/3) * NUM_ROWS


// This determines where the structures are placed on the background. Each structure only displays a certain amount
// of copies; if there are more built than we have coordinates for the rest just aren't shown.
// Note: row is relative to the top of the page, col is relative to the center of the page
// TODO specify model (e.g. harvester2)
const STRUCTURE_POSITIONS = {
    harvester: [
        { row: 50, col: 10, animationId: 'harvester2' },
        { row: 45, col: -10 },
        { row: 52, col: -55 },
        { row: 54, col: -5, animationId: 'harvester2' },
        { row: 50, col: -30, animationId: 'harvester' },
        { row: 37, col: 5, animationId: 'harvester2' },
        { row: 53, col: 43, animationId: 'harvester' },
        { row: 47, col: 50, animationId: 'harvester2' },
    ],
    solarPanel: [
        { row: 36, col: -25 },
        { row: 36, col: -39 },
        { row: 37, col: -53 },
        { row: 37, col: -67 },

        { row: 39, col: -18 },
        { row: 39, col: -32 },
        { row: 40, col: -46 },
        { row: 40, col: -60 },

        { row: 42, col: -24 },
        { row: 43, col: -38 },
        { row: 43, col: -52 },
        { row: 43, col: -66 },
    ],
    windTurbine: [
        { row: 18, col: 10 },
        { row: 18, col: 17 },
        { row: 19, col: 24 },
        { row: 19, col: 31 },
        { row: 20, col: 38 },
        { row: 21, col: 45 },
        { row: 22, col: 52 },
    ],
    energyBay: [
        { row: 28, col: 5 },
        { row: 28, col: 16 },
        { row: 29, col: 28 },
        { row: 29, col: 40 },
        { row: 30, col: 53 },

        { row: 32, col: 8 },
        { row: 32, col: 19 },
        { row: 33, col: 31 },
        { row: 33, col: 43 },
        { row: 34, col: 55 },

    ],
    refinery: [
        { row: 17, col: -30 },
        { row: 20, col: -43 },
        { row: 16, col: -50 },
        { row: 21, col: -60 },
    ],
    droidFactory: [
        { row: 37, col: 20 },
        { row: 38, col: 35 },
    ]
}
const DOODAD_POSITIONS = {
    vent: [
        { row: 52, col: -40 }
    ],
    rocks: [
        { row: 53, col: 30, animationId: 'rock1' },
        { row: 43, col: -70, animationId: 'rock1' },
        { row: 42, col: -10, animationId: 'rock2' },
        { row: 46, col: 25, animationId: 'rock3' },
        { row: 33, col: -45, animationId: 'rock4' },
        { row: 30, col: 45, animationId: 'rock4' },
    ]
}


// const ANIMATION_DELAYS = createArray(20, () => Math.random());
const ANIMATION_DELAYS = [0.33, 0.51, 0.91, 0.37, 0.77, 0.15, 0.63, 0.49, 0.88]

export function generateImage(structureAnimationData, elapsedTime, fractionOfDay) {
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
    const clockParams = [elapsedTime, fractionOfDay]

    renderBackground(result, backgrounds.stars, 0, 0, clockParams);
    renderBackground(result, backgrounds.planet, 10, 0, clockParams); // todo rename terrain?

    // Cannot just iterate through all structures/doodads and render them in order; we need to render them according
    // to their lowest (i.e. towards the bottom of the page) character. If we render lower images later than higher images,
    // the lower images can overlap/overwrite the higher images (which makes sense because they are "closer" to the viewer).
    const renderingQueue = [];

    for (const [structureId, animationData] of Object.entries(structureAnimationData)) {
        queueStructure(renderingQueue, structureId, animationData, clockParams);
    }

    for (const [doodadId, positions] of Object.entries(DOODAD_POSITIONS)) {
        queueDoodad(renderingQueue, doodadId, clockParams)
    }

    // Sort the queue (according to the BOTTOM of the frame; i.e. the frame row + frame height) and then render everything
    _.sortBy(renderingQueue, [(rendering) => rendering.row + rendering.frame.charArray.length]).forEach(rendering => {
        renderImage(result, rendering.row, rendering.col, rendering.frame.charArray, rendering.frame.color)
    })

    return result;
}

// Backgrounds line up with the top of the page, but get centered horizontally
function renderBackground(result, background, rowOffset, colOffset, clockParams) {
    const backgroundWidth = Math.max(...background.background.map(row => row.length));
    colOffset += Math.floor(NUM_COLS / 2) - Math.floor(backgroundWidth / 2); // centers background horizontally
    const color = getDynamicValue(background.color, clockParams)

    renderImage(result, rowOffset, colOffset, background.background, color);
}

function queueStructure(renderingQueue, structureId, animationData, clockParams) {
    const { numBuilt, animationTag } = animationData;
    const [elapsedTime, fractionOfDay] = clockParams;

    (STRUCTURE_POSITIONS[structureId] || []).forEach((position, index) => {
        if (numBuilt > index) {
            const animationId = position.animationId || structureId;
            const animation = _.get(structures, `${animationId}.${animationTag}`);
            if (!animation) { return; }
            const frame = animation.getFrame(elapsedTime, ANIMATION_DELAYS[index]);
            renderingQueue.push({ frame: frame, row: position.row, col: position.col + Math.floor(NUM_COLS / 2) })
        }
    })
}

function queueDoodad(renderingQueue, doodadId, clockParams) {
    const [elapsedTime, fractionOfDay] = clockParams;

    (DOODAD_POSITIONS[doodadId] || []).forEach((position, index) => {
        const animationId = position.animationId || doodadId
        const animation = _.get(doodads, `${animationId}.idle`);
        if (!animation) { return; }
        const frame = animation.getFrame(elapsedTime, ANIMATION_DELAYS[index]);
        renderingQueue.push({ frame: frame, row: position.row, col: position.col + Math.floor(NUM_COLS / 2) })
    })
}

// Adds a frame (array of ascii strings) to the result
function renderImage(result, rowOffset, colOffset, charArray, color) {
    charArray.forEach((row, rowIndex) => {
        row.split('').forEach((char, colIndex) => {
            const row = rowIndex + rowOffset;
            const col = colIndex + colOffset;
            if (row >= 0 && row < NUM_ROWS && col >= 0 && col < NUM_COLS && char !== ' ') {
                result[row][col] = [char, color];
            }
        })
    });
}