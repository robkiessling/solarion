/**
 * The arena's geometry: the numbers the sim (sim.ts), the openings (openings.ts) and the terrain (terrain.ts)
 * all measure by.
 */

export type XY = { x: number, y: number };

// Baseline arena coordinate space. Droids enter from the left, hostiles from the right. Battles above the
// baseline headcount scale both dimensions up (see createBattle in sim.ts); battle.arenaW/arenaH are the
// authoritative dimensions, these constants are the floor (and the fallback for pre-scaling saves).
export const ARENA_W = 100;
export const ARENA_H = 60;

export const FRONT_GAP = 44;        // spawn distance between the two front lines, at any arena size

// Arena terrain cell metrics: a body width wide, a glyph tall (the renderer draws obstacle art at these)
export const TERRAIN_CELL_W = 2;    // arena units; about one monospace char at the unit font size
export const TERRAIN_CELL_H = 3.2;  // matches the renderer's glyph height, so art cells stay square-ish

// Deterministic 32-bit hash -> [0, 1). Decorrelates per-unit phases (wobble, swing timers, collision
// tie-breaks) without RNG: linear-in-index seeds made whole formations snake and swing in sync, because
// neighbors in a lattice have neighboring indices.
export function hash01(n: number) {
    let h = Math.imul(n + 1, 2654435761);
    h = Math.imul(h ^ (h >>> 13), 1597334677);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
