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
        { row: 0, col: 0 },
        { row: 24, col: 10 }
    ],
    solarPanel: [
        { row: 35, col: -25 },
        { row: 40, col: -32 },
        { row: 35, col: -39 },
        { row: 40, col: -46 },
        { row: 50, col: -5 },
    ],
    windTurbine: [
        { row: 20, col: 10 },
        { row: 21, col: 17 },
        { row: 22, col: 24 },
        { row: 23, col: 31 },
        { row: 24, col: 38 },
    ],
    energyBay: [
        { row: 50, col: 10 },
    ]
}
const DOODAD_POSITIONS = {
    vent: [
        { row: 50, col: -40 }
    ],
    rocks: [
        { row: 40, col: -35, animationId: 'rock1' },
        { row: 40, col: 35, animationId: 'rock1' }
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

    // Sort the queue (according to the BOTTOM of the image; i.e. the image row + image height) and then render everything
    _.sortBy(renderingQueue, [(rendering) => rendering.row + rendering.image.length]).forEach(rendering => {
        renderImage(result, rendering.image, rendering.row, rendering.col, rendering.color)
    })

    return result;
}

// Backgrounds line up with the top of the page, but get centered horizontally
function renderBackground(result, background, rowOffset, colOffset, clockParams) {
    const backgroundWidth = Math.max(...background.background.map(row => row.length));
    colOffset += Math.floor(NUM_COLS / 2) - Math.floor(backgroundWidth / 2); // centers background horizontally
    const color = getDynamicValue(background.color, clockParams)

    renderImage(result, background.background, rowOffset, colOffset, color);
}

function queueStructure(renderingQueue, structureId, animationData, clockParams) {
    const { numBuilt, imageKey } = animationData;
    if (numBuilt < 1) { return; }

    const [elapsedTime, fractionOfDay] = clockParams;
    
    (STRUCTURE_POSITIONS[structureId] || []).forEach((position, index) => {
        if (numBuilt > index) {
            const animation = _.get(structures, `${structureId}.${imageKey}`); // TODO This can be based off of modelId
            const animationDelay = ANIMATION_DELAYS[index];
            if (!animation) { return; }

            const image = animation.random ?
                getRandomAnimationFrame(structures[structureId][animation.random], animationDelay) :
                getAnimationFrame(animation, elapsedTime, animationDelay);

            renderingQueue.push({ image: image, row: position.row, col: position.col + Math.floor(NUM_COLS / 2), color: '#fff' })
        }
    })
}

function queueDoodad(renderingQueue, doodadId, clockParams) {
    const [elapsedTime, fractionOfDay] = clockParams;

    (DOODAD_POSITIONS[doodadId] || []).forEach((position, index) => {
        const animationId = position.animationId || doodadId
        const animation = _.get(doodads, `${animationId}.idle`);
        const animationDelay = ANIMATION_DELAYS[index];
        if (!animation) { return; }

        const image = getAnimationFrame(animation, elapsedTime, animationDelay)
        renderingQueue.push({ image: image, row: position.row, col: position.col + Math.floor(NUM_COLS / 2), color: '#fff' })
    })
}

/**
 * @param animation An object with format { fps: x, frames: [] } that 
 * @param elapsedTime How much time has passed
 * @param animationDelay Random number that makes each structure have a different animation frame
 * @returns An image (array of ascii strings) to show at this moment
 */
function getAnimationFrame(animation, elapsedTime, animationDelay) {
    let { fps, frames } = animation;

    if (frames.length === 1 || fps === 0) {
        return frames[0];
    }

    if (Array.isArray(fps)) {
        fps = fps[Math.floor(animationDelay * fps.length)]
    }

    const frameDuration = 1 / fps;
    const animationDuration = frames.length * frameDuration;
    elapsedTime += animationDelay * animationDuration;
    const timeIntoAnimation = mod(elapsedTime, animationDuration);
    return frames[Math.floor(timeIntoAnimation / frameDuration)];
}

function getRandomAnimationFrame(animation, animationDelay) {
    return animation.frames[Math.floor(animationDelay * animation.frames.length)];
}

// Adds an image (array of ascii strings) to the result
function renderImage(result, image, rowOffset, colOffset, color) {
    image.forEach((row, rowIndex) => {
        row.split('').forEach((char, colIndex) => {
            const row = rowIndex + rowOffset;
            const col = colIndex + colOffset;
            if (row >= 0 && row < NUM_ROWS && col >= 0 && col < NUM_COLS && char !== ' ') {
                result[row][col] = [char, color];
            }
        })
    });
}