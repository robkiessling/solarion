/**
 * Scattered terrains: terrains made by dropping pieces (terrain_art.ts, terrain_pieces.ts) at random spots,
 * the same spots every time a given site is fought (the placer seeds from the site's tile).
 *   scatter  the pieces to pick from; each placement picks a name, then one of that piece's looks. Name a
 *            piece twice to make it twice as likely.
 *   count    how many to place on the terrain's smallest arena (its `minSize`; small holds fights up to 160 a
 *            side). A bigger arena gets more, in proportion to how much the band has grown. Pieces
 *            that do not fit are left out, so a count too high for the band just fills it.
 *   band     where they go:
 *              middle  the strip between the two fronts
 *              field   the whole field, short of both ends
 *              left    the squad's half          right  the hostile half
 *   minSize  the smallest arena it is fought on (ARENA_SIZES), for pieces too big for the small one. A fight
 *            too big for it still gets the arena its headcount calls for. Unset = small.
 * Levels name a terrain by its key (`terrain:` in database/planet/pois.ts). PLACEHOLDER tuning.
 */
import type {TerrainPieceId} from "./terrain_art";

export type TerrainBand = 'middle' | 'field' | 'left' | 'right';

export interface ScatteredTerrain {
    scatter: TerrainPieceId[];
    count: number;
    band: TerrainBand;
    minSize?: ArenaSize;
}

// The arena sizes, [cols, rows] in terrain cells: the canvases the drawn terrains are drawn on. Small is the
// baseline arena.
export type ArenaSize = 'small' | 'medium' | 'large';
export const ARENA_SIZES: Record<ArenaSize, [number, number]> = { small: [50, 19], medium: [70, 30], large: [125, 47] };

export const SCATTERED_TERRAINS = {
    rocks: { scatter: ['boulder', 'spire', 'boulderBig', 'boulder', 'spire'], count: 5, band: 'middle' },
    ruins: { scatter: ['ruins', 'rubble', 'rubble', 'boulder'], count: 5, band: 'field' },
    rubble: { scatter: ['rubble', 'rubble', 'boulderBig', 'boulder'], count: 6, band: 'field' },
    debris: { scatter: ['debris', 'rubble', 'boulder'], count: 4, band: 'field' },
    caves: { scatter: ['cave'], count: 2, band: 'right', minSize: 'medium' }
} satisfies Record<string, ScatteredTerrain>;
