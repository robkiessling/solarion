import {
    createArray,
    mod,
    roundToDecimal,
} from "./helpers";
/**
 * This module owns the SHAPE of the planet and the spatial relationships between tiles (adjacency, distance).
 * It holds no game state, terrain, or rendering.
 *
 * UNIFORM GRID: the world is a cylinder of NUM_PLANET_ROWS latitude rows x PLANET_COLS columns. Columns wrap
 * east-west; rows do not wrap north-south (solid ice rows wall off the poles). Every row is the same length,
 * so adjacency is a plain 4-neighbor grid: "up" is exactly [row-1, col] at any camera rotation, rows never
 * shift relative to each other while panning, and step movement is symmetric (no one-way diagonal gaps).
 *
 * The display window shows DISPLAY_COLS (half the planet). The planet's round silhouette is NOT structural --
 * it comes from an elliptical render-time mask over the window (DISPLAY_MASK in planet_map.ts). DISPLAY_COLS
 * is chosen so the window renders square (cols * charRatio 0.5 == rows), making the masked ellipse a circle.
 */
export const NUM_PLANET_ROWS = 30;
export const DISPLAY_COLS = 60;
export const PLANET_COLS = DISPLAY_COLS * 2; // Display only shows half of real planet

export const NUM_SECTORS = NUM_PLANET_ROWS * PLANET_COLS;

export const DIRECTIONS = {
    north: 'N',  northEast: 'NE',  east: 'E',  southEast: 'SE',
    south: 'S', southWest: 'SW', west: 'W', northWest: 'NW'
}
export const ALL_DIRECTIONS = Object.values(DIRECTIONS);

// Steps one tile in a compass direction: columns wrap, rows stop at the poles (returns null past them).
// Used by map generation (mountain ranges walk in a direction); gameplay movement uses getAdjacentCoords.
export function stepInCompassDirection(currentCoord: Coord, direction: string): Coord | null {
    const [rowOffset, colOffset] = directionToOffset(direction);
    const newRow = currentCoord[0] + rowOffset;
    if (newRow < 0 || newRow >= NUM_PLANET_ROWS) return null;
    return [newRow, mod(currentCoord[1] + colOffset, PLANET_COLS)];
}

function directionToOffset(direction: string): [number, number] {
    switch(direction) {
        case DIRECTIONS.north: return [-1, 0];
        case DIRECTIONS.northEast: return [-1, 1];
        case DIRECTIONS.east: return [0, 1];
        case DIRECTIONS.southEast: return [1, 1];
        case DIRECTIONS.south: return [1, 0];
        case DIRECTIONS.southWest: return [1, -1];
        case DIRECTIONS.west: return [0, -1];
        case DIRECTIONS.northWest: return [-1, -1];
        default: throw new Error(`Unknown compass direction: ${direction}`);
    }
}

// ADJACENT_COORDS[row][col] => array of [row, col] neighbor coords: east/west (wrapping) plus north/south
// where they exist (3 neighbors on the pole rows, 4 everywhere else). Precomputed once.
const ADJACENT_COORDS = createArray(NUM_PLANET_ROWS, (rowIndex) => {
    return createArray(PLANET_COLS, (colIndex) => {
        const neighbors: Coord[] = [
            [rowIndex, mod(colIndex - 1, PLANET_COLS)],
            [rowIndex, mod(colIndex + 1, PLANET_COLS)],
        ];
        if (rowIndex > 0) neighbors.push([rowIndex - 1, colIndex]);
        if (rowIndex < NUM_PLANET_ROWS - 1) neighbors.push([rowIndex + 1, colIndex]);
        return neighbors;
    });
});

// Gameplay adjacency. NOTE: returns the cached neighbor list -- treat as read-only.
export function getAdjacentCoords(coord: Coord): Coord[] {
    return ADJACENT_COORDS[coord[0]][coord[1]];
}

// SURROUNDING_COORDS[row][col] => the 8 tiles touching this one (the 4 orthogonal neighbors plus the
// diagonals): columns wrap east/west, rows clamp at the poles (5 entries on a pole row, 8 elsewhere).
// This is a VISION shape only; movement and the coverage graph stay 4-connected (see getAdjacentCoords).
const SURROUNDING_COORDS = createArray(NUM_PLANET_ROWS, (rowIndex) => {
    return createArray(PLANET_COLS, (colIndex) => {
        const neighbors: Coord[] = [];
        for (let rowOffset = -1; rowOffset <= 1; rowOffset++) {
            const row = rowIndex + rowOffset;
            if (row < 0 || row >= NUM_PLANET_ROWS) continue;
            for (let colOffset = -1; colOffset <= 1; colOffset++) {
                if (rowOffset === 0 && colOffset === 0) continue;
                neighbors.push([row, mod(colIndex + colOffset, PLANET_COLS)]);
            }
        }
        return neighbors;
    });
});

// Line-of-sight neighborhood (8-way). NOTE: returns the cached list -- treat as read-only.
export function getSurroundingCoords(coord: Coord): Coord[] {
    return SURROUNDING_COORDS[coord[0]][coord[1]];
}

// Flood-fills outward from `coord` along the adjacency graph and returns every coord within `steps` hops
// (excluding `coord` itself). Used to reveal a small contiguous blob, e.g. the area around the home base.
export function getCoordsWithinHops(coord: Coord, steps: number = 1): Coord[] {
    const visited = new Set([`${coord[0]},${coord[1]}`]);
    let frontier = [coord];
    const result: Coord[] = [];

    for (let step = 0; step < steps; step++) {
        const nextFrontier: Coord[] = [];
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

// Cheap heuristic distance (row difference weighted heavier because text characters are taller than wide;
// column difference takes the short way around the wrap). Prefer graph distance (BFS hops) for anything
// directional like exploration ordering.
export function getApproxDistance(coord1: Coord, coord2: Coord): number {
    const rowOffset = Math.abs(coord2[0] - coord1[0]);
    const directColOffset = Math.abs(coord2[1] - coord1[1]);
    const colOffset = Math.min(directColOffset, PLANET_COLS - directColOffset);

    return roundToDecimal(rowOffset**(1.5) + colOffset, 5);
}

// BFS hop-distance from `fromCoord` to every tile. This is pure topology -- it ignores terrain and
// passability -- so the graph is fully connected and every tile gets a finite distance.
// Returns a 2D array: distances[row][col].
export function getGraphDistancesFrom(fromCoord: Coord): number[][] {
    const distances = createArray(NUM_PLANET_ROWS, () => createArray(PLANET_COLS, () => Infinity));
    distances[fromCoord[0]][fromCoord[1]] = 0;

    let frontier = [fromCoord];
    let distance = 0;
    while (frontier.length > 0) {
        distance++;
        const nextFrontier: Coord[] = [];
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
