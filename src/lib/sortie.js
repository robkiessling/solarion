import {getAdjacentCoords, NUM_PLANET_ROWS, PLANET_COLS} from "./planet_geometry";
import {getCrossTime, STATUSES, TERRAINS} from "./planet_map";
import {mod} from "./helpers";

/**
 * Sortie prototype: a directly-driven squad for testing manual exploration feel (click-to-move and keyboard
 * steps). Owns the pure movement/charge/reveal simulation; input handling lives in the planet component and
 * redux thunks. Deliberately separate from expeditions.js so the POI expedition loop is untouched while the
 * prototype is evaluated.
 */

export const SORTIE_GLYPH = '◈';

// Movement pace. crossTime is seconds-per-tile for scouts; the sortie multiplies it down so driving feels
// snappy (flatland 0.5s * 0.4 = 200ms/tile, ~5 tiles/sec).
export const SORTIE_SPEED_FACTOR = 0.4;

// Charge model: drains per tile entered while off the powered grid, snaps to full on the grid. At zero the
// sortie limps ("reserve power"): crossings take twice as long. A planning aid, never a fail state.
export const SORTIE_MAX_CHARGE = 100;
export const SORTIE_DRAIN_PER_TILE = 2;
export const RESERVE_SPEED_PENALTY = 2;

const GRID_TERRAINS = new Set([TERRAINS.home.enum, TERRAINS.developing.enum, TERRAINS.developed.enum]);

export function createSortie(homeCoord) {
    return {
        coord: homeCoord,
        path: [],
        moveProgress: 0,
        charge: SORTIE_MAX_CHARGE
    };
}

// The powered grid: home base and replicated land. Standing here recharges instantly.
export function isOnGrid(map, coord) {
    return GRID_TERRAINS.has(map[coord[0]][coord[1]].terrain);
}

export function sortieCrossMs(map, coord, unlocks, charge) {
    const base = getCrossTime(map[coord[0]][coord[1]].terrain, unlocks) * 1000 * SORTIE_SPEED_FACTOR;
    return charge <= 0 ? base * RESERVE_SPEED_PENALTY : base;
}

/**
 * Advances the sortie one tick along its path. Per tile entered: line-of-sight reveal (the tile + its
 * neighbors, same rule as scouts), charge drain off-grid / snap-to-full on-grid. Pure; returns the next
 * sortie plus the coords newly revealed this tick (still-unknown tiles only).
 */
export function advanceSortie(map, sortie, moveAmountMs, unlocks) {
    let {coord, path, moveProgress, charge} = sortie;
    path = path ? path.slice() : [];
    moveProgress = (moveProgress || 0) + moveAmountMs;

    const reveals = new Set();
    const reveal = ([r, c]) => {
        if (map[r][c].status === STATUSES.unknown.enum) reveals.add(`${r},${c}`);
    };

    while (path.length > 0) {
        const next = path[0];
        const tileCrossMs = sortieCrossMs(map, next, unlocks, charge);
        if (moveProgress < tileCrossMs) break;
        moveProgress -= tileCrossMs;
        coord = next;
        path = path.slice(1);

        reveal(coord);
        getAdjacentCoords(coord).forEach(reveal);

        charge = isOnGrid(map, coord) ?
            SORTIE_MAX_CHARGE :
            Math.max(0, charge - SORTIE_DRAIN_PER_TILE);
    }

    if (path.length === 0) moveProgress = 0;

    return {
        sortie: {...sortie, coord, path, moveProgress, charge},
        reveals: [...reveals].map(key => key.split(',').map(Number))
    };
}

/**
 * Keyboard step target: pure coordinate arithmetic on the uniform grid. Up/down move one row (null at the
 * poles -- the world doesn't wrap north-south), left/right move one column with east-west wrap. dirVec is a
 * screen-space unit vector (up = [0,-1]); on the uniform grid screen space IS coordinate space, at any camera
 * rotation, which is what makes movement reversible and camera-independent. Ignores passability -- the caller
 * decides whether a blocked target means "reveal the wall" or "bump".
 */
export function stepInDirection(coord, dirVec) {
    const [dx, dy] = dirVec;

    if (dy !== 0) {
        const row = coord[0] + dy;
        if (row < 0 || row >= NUM_PLANET_ROWS) return null;
        return [row, coord[1]];
    }

    return [coord[0], mod(coord[1] + dx, PLANET_COLS)];
}
