/**
 * Scatter terrains: battlefields made by dropping pieces (terrain_art.ts, terrain_pieces.ts) at random spots,
 * the same spots every time a given site is fought (the placer seeds from the site's tile).
 *   scatter  the pieces to pick from; each placement picks a name, then one of that piece's looks. Name a
 *            piece twice to make it twice as likely.
 *   count    how many to place on the baseline arena (the smallest: fights up to 160 a side). A bigger arena
 *            gets more, in proportion to how much the band has grown. Pieces that do not fit are left out,
 *            so a count too high for the band just fills it.
 *   band     where they go:
 *              middle  the strip between the two fronts
 *              field   the whole field, short of both ends
 *              left    the squad's half          right  the hostile half
 * Levels name a terrain by its key (`terrain:` in database/planet/pois.ts). PLACEHOLDER tuning.
 */
import type {TerrainPieceId} from "./terrain_art";

export type TerrainBand = 'middle' | 'field' | 'left' | 'right';

export interface ScatterTerrain {
    scatter: TerrainPieceId[];
    count: number;
    band: TerrainBand;
}

export const SCATTER_TERRAINS = {
    rocks: { scatter: ['boulder', 'spire', 'boulderBig', 'boulder', 'spire'], count: 5, band: 'middle' },
    ruins: { scatter: ['ruins', 'rubble', 'rubble', 'boulder'], count: 5, band: 'field' },
    rubble: { scatter: ['rubble', 'rubble', 'boulderBig', 'boulder'], count: 6, band: 'field' },
    debris: { scatter: ['debris', 'rubble', 'boulder'], count: 4, band: 'field' }
} satisfies Record<string, ScatterTerrain>;
