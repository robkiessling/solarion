import {
    createArray,
    floor,
    mod,
    roundToDecimal,
} from "./helpers";

/**
 * This module owns the SHAPE of the planet (tiles per row) and the spatial relationships between tiles (meridians,
 * gameplay adjacency, distance). It holds no game state, terrain, or rendering -- just geometry derived once from the
 * row lengths.
 */


// =====================================================================================================================
// SECTION: Row dimensions
// =====================================================================================================================

/**
 * The ascii planet is a 2D array of characters. There are a full 360 degrees of chars, but only half of it is visible
 * to the user at one time. Variable names like "PLANET_ROW_LENGTHS" refers to the entire 360 degree row, whereas names
 * like "DISPLAY_ROW_LENGTHS" refers to the 180 degrees that is visible.
 */
// const DISPLAY_ROW_LENGTHS = [7, 13, 17, 19, 21, 21, 21, 19, 17, 13, 7];
// const DISPLAY_ROW_LENGTHS = [7, 17, 23, 29, 33, 35, 37, 39, 41, 41, 41, 41, 41, 39, 37, 35, 33, 29, 23, 17, 7];
const DISPLAY_ROW_LENGTHS_HALF = [9, 19, 29, 35, 39, 43, 47, 49, 51, 53, 55, 57, 57, 57, 59]; // odd values
export const DISPLAY_ROW_LENGTHS = (DISPLAY_ROW_LENGTHS_HALF.slice()).concat(DISPLAY_ROW_LENGTHS_HALF.slice().reverse());

export const PLANET_ROW_LENGTHS = DISPLAY_ROW_LENGTHS.map(length => length * 2); // Display only shows half of real planet
export const NUM_PLANET_ROWS = PLANET_ROW_LENGTHS.length;

export const WIDEST_PLANET_ROW = Math.max(...PLANET_ROW_LENGTHS);
export const WIDEST_DISPLAY_ROW = Math.max(...DISPLAY_ROW_LENGTHS);
export const NUM_SECTORS = PLANET_ROW_LENGTHS.reduce((a, b) => a + b, 0);

export const DIRECTIONS = {
    north: 'N',  northEast: 'NE',  east: 'E',  southEast: 'SE',
    south: 'S', southWest: 'SW', west: 'W', northWest: 'NW'
}
export const ALL_DIRECTIONS = Object.values(DIRECTIONS);

// =====================================================================================================================
// SECTION: Coordinate adjacency
//
// There are TWO ways to relate tile coordinates on this sphere, used for different purposes:
//
//   1. MERIDIAN NAV (directional, single-step). E.g. "what is the ONE tile to the north/east of here?"
//      Follows lines of longitude. Used for map generation (mountain ranges walk in a direction) and drawing
//      meridian/sector lines. Lossy near the poles (picks one representative, drops the rest) and not symmetric (so
//      not used for gameplay/movement)
//
//   2. COVERAGE GRAPH (undirected, multi-neighbor): "what are ALL the tiles touching here?"
//      This is the gameplay adjacency -- symmetric, connected, renders solid. A tile can have more than 4 fixed
//      neighbors; see its subsection for more info.
// =====================================================================================================================


// --- Model 1: Meridian directional nav ---------------------------------------------------------------------------

/**
 * When moving north/south, you cannot simply stay at the same column and move one row higher/lower because there are
 * fewer columns the closer you get to the poles. To figure out which column to move to, we keep track of "meridians".
 *
 * A meridian is an array of column indices. The example below shows the planet with 4 meridians displayed. The meridian
 * for #1 would be an array that looks like: [1, 4, 6, 8, ...], where the first value of 1 means that for row 0 it is col 1.
 *
 *                          01**23**
 *                     0***1****2***3****
 *                0*****1*******2*****3*******
 *             0*******1********2*******3********
 *           0********1*********2********3*********
 *         0*********1**********2*********3**********
 *       0**********1***********2**********3***********
 *      0**********1************2**********3************
 *     0***********1************2***********3************
 *    0***********1*************2***********3*************
 *   0************1*************2************3*************
 *  0************1**************2************3**************
 *  0************1**************2************3**************
 *  0************1**************2************3**************
 * 0*************1**************2*************3**************
 * 0*************1**************2*************3**************
 *  0************1**************2************3**************
 *  0************1**************2************3**************
 *  0************1**************2************3**************
 *   0************1*************2************3*************
 *    0***********1*************2***********3*************
 *     0***********1************2***********3************
 *      0**********1************2**********3************
 *       0**********1***********2**********3***********
 *         0*********1**********2*********3**********
 *           0********1*********2********3*********
 *             0*******1********2*******3********
 *                0*****1*******2*****3*******
 *                     0***1****2***3****
 *                          01**23**
 *
 * We keep track of many meridians; not just the 4 shown above. We keep track of as many meridians as there are chars
 * in the widest row, thus every coord has at least one meridian going through it.
 *
 * It is important to note that a coord can have MULTIPLE meridians passing through it. In the example above, all the
 * meridians between #0 and #1 must converge into the 2 characters of "0" and "1" on the north-most row. This is different
 * from real life, where meridians don't actually overlap.
 */
export const MERIDIANS = createArray(WIDEST_PLANET_ROW, (meridianIndex) => {
    const percent = meridianIndex / WIDEST_PLANET_ROW;
    return createArray(NUM_PLANET_ROWS, (rowIndex) => {
        const rowLength = PLANET_ROW_LENGTHS[rowIndex];
        return floor(percent * rowLength);
    });
});

/**
 * As mentioned previously, multiple meridians may pass through a single coord (since we show discrete ascii chars).
 * We specify ONE of the meridians to be the "primary" meridian for that coord. That way, if you move West/East onto a
 * new coord, you can look up what your new meridian is.
 */
export const COORD_TO_MERIDIAN_LOOKUP = {}; // { row => { col => meridianIndex } }
MERIDIANS.forEach((meridianColumns, meridianIndex) => {
    meridianColumns.forEach((meridianColumn, rowIndex) => {
        if (COORD_TO_MERIDIAN_LOOKUP[rowIndex] === undefined) {
            COORD_TO_MERIDIAN_LOOKUP[rowIndex] = {}
        }
        if (COORD_TO_MERIDIAN_LOOKUP[rowIndex][meridianColumn] === undefined) {
            COORD_TO_MERIDIAN_LOOKUP[rowIndex][meridianColumn] = meridianIndex;
        }
    })
})

// Steps one tile in a compass direction, following the meridian line for north/south. Single-valued and lossy near
// the poles. Should be used for generation/visuals only, NOT gameplay adjacency (use getAdjacentCoords for that).
export function meridianStepInDirection(currentCoord, direction) {
    const [rowOffset, colOffset] = directionToOffset(direction);
    return meridianStepByOffset(currentCoord, rowOffset, colOffset);
}

function meridianStepByOffset(currentCoord, rowOffset, colOffset) {
    let newRow = currentCoord[0];
    let newCol = currentCoord[1];
    let meridian = COORD_TO_MERIDIAN_LOOKUP[currentCoord[0]][currentCoord[1]]

    if (rowOffset !== 0) { // north/south movement -- maintain meridian line
        newRow += rowOffset;
        if (newRow < 0 || newRow >= NUM_PLANET_ROWS) {
            return null; // Cannot pass north/south edge
        }
        newCol = MERIDIANS[meridian][newRow]
    }

    if (colOffset !== 0) { // west/east movement -- get coord one column over. find new meridian
        newCol = mod(newCol + colOffset, PLANET_ROW_LENGTHS[newRow]); // column can wrap around globe
    }

    return [newRow, newCol]
}

function directionToOffset(direction) {
    switch(direction) {
        case DIRECTIONS.north: return [-1, 0];
        case DIRECTIONS.northEast: return [-1, 1];
        case DIRECTIONS.east: return [0, 1];
        case DIRECTIONS.southEast: return [1, 1];
        case DIRECTIONS.south: return [1, 0];
        case DIRECTIONS.southWest: return [1, -1];
        case DIRECTIONS.west: return [0, -1];
        case DIRECTIONS.northWest: return [-1, -1];
    }
}


// --- Model 2: Coverage graph (gameplay adjacency) ----------------------------------------------------------------

/**
 * A tile does NOT have a fixed 4 neighbors. At the equator it does (1 each way), but near the poles rows differ in
 * length so one tile sits over MULTIPLE tiles in the next row (e.g. row-0 col 5 covers row-1 cols 10/11/12). Meridian
 * nav forced one tile per direction and dropped the rest, which left holes and broke symmetry. Keeping every overlap
 * is what makes explored regions fill solid.
 */
function getOverlappingCols(rowIndex, colIndex, otherRowIndex) {
    const rowLength = PLANET_ROW_LENGTHS[rowIndex];
    const otherRowLength = PLANET_ROW_LENGTHS[otherRowIndex];
    const startFraction = colIndex / rowLength;
    const endFraction = (colIndex + 1) / rowLength;

    const neighborCols = [];
    const firstCol = Math.floor(startFraction * otherRowLength);
    const lastCol = Math.ceil(endFraction * otherRowLength);
    for (let otherCol = firstCol; otherCol < lastCol; otherCol++) {
        const overlap = Math.min(endFraction, (otherCol + 1) / otherRowLength) -
            Math.max(startFraction, otherCol / otherRowLength);
        if (overlap > 1e-9) { // strictly overlapping (not merely touching at a boundary)
            neighborCols.push(mod(otherCol, otherRowLength));
        }
    }
    return neighborCols;
}

// ADJACENT_COORDS[row][col] => array of [row, col] neighbor coords. Precomputed once since the topology never changes.
const ADJACENT_COORDS = createArray(NUM_PLANET_ROWS, (rowIndex) => {
    const rowLength = PLANET_ROW_LENGTHS[rowIndex];
    return createArray(rowLength, (colIndex) => {
        const neighbors = [
            [rowIndex, mod(colIndex - 1, rowLength)],
            [rowIndex, mod(colIndex + 1, rowLength)],
        ];
        if (rowIndex > 0) {
            getOverlappingCols(rowIndex, colIndex, rowIndex - 1).forEach(c => neighbors.push([rowIndex - 1, c]));
        }
        if (rowIndex < NUM_PLANET_ROWS - 1) {
            getOverlappingCols(rowIndex, colIndex, rowIndex + 1).forEach(c => neighbors.push([rowIndex + 1, c]));
        }
        return neighbors;
    });
});

// Gameplay adjacency: returns the coverage-graph neighbors of a tile (see ADJACENT_COORDS above).
// NOTE: returns the cached neighbor list -- treat as read-only, do not mutate the returned array or its coords.
export function getAdjacentCoords(coord) {
    return ADJACENT_COORDS[coord[0]][coord[1]];
}

// Flood-fills outward from `coord` along the coverage graph and returns every coord within `steps` hops
// (excluding `coord` itself). Used to reveal a small contiguous blob, e.g. the area around the home base.
export function getCoordsWithinHops(coord, steps = 1) {
    const visited = new Set([`${coord[0]},${coord[1]}`]);
    let frontier = [coord];
    const result = [];

    for (let step = 0; step < steps; step++) {
        const nextFrontier = [];
        frontier.forEach(current => {
            getAdjacentCoords(current).forEach(neighbor => {
                const key = `${neighbor[0]},${neighbor[1]}`;
                if (!visited.has(key)) {
                    visited.add(key);
                    nextFrontier.push(neighbor);
                    result.push(neighbor);
                }
            });
        });
        frontier = nextFrontier;
    }

    return result;
}


// =====================================================================================================================
// SECTION: Distance
// =====================================================================================================================

// NOTE: this measures column distance in a per-row-centered frame, which is only unbiased when the reference point sits
// at longitude 0.5. For off-center points it skews diagonally, so prefer graph distance (BFS hops on the coverage
// graph) for anything directional like exploration ordering.
export function getApproxDistance(coord1, coord2) {
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
    return roundToDecimal(rowOffset**(1.5) + colOffset, 5);
}

// BFS hop-distance from `fromCoord` to every tile, over the coverage graph. This is pure topology -- it ignores terrain
// and passability -- so the graph is fully connected and every tile gets a finite distance. Unlike
// getApproxDistance it has no directional bias, which makes it the right metric for ordering exploration
// (closest-to-home first => exploration spreads as a clean ring). Returns a 2D array: distances[row][col].
export function getGraphDistancesFrom(fromCoord) {
    const distances = PLANET_ROW_LENGTHS.map(rowLength => createArray(rowLength, () => Infinity));
    distances[fromCoord[0]][fromCoord[1]] = 0;

    let frontier = [fromCoord];
    let distance = 0;
    while (frontier.length > 0) {
        distance++;
        const nextFrontier = [];
        frontier.forEach(coord => {
            getAdjacentCoords(coord).forEach(([row, col]) => {
                if (distances[row][col] === Infinity) {
                    distances[row][col] = distance;
                    nextFrontier.push([row, col]);
                }
            });
        });
        frontier = nextFrontier;
    }

    return distances;
}
