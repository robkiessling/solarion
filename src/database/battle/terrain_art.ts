/**
 * Battle-arena obstacle pieces, stamped onto the arena's terrain grid (lib/battle/sim.ts). A piece is a list
 * of looks (the placer picks one per placement); a look is its `art` (what is drawn), its `solid` mask (the
 * collision map: '#' blocks one terrain cell, about one body wide) and what it marks for the opening.
 *
 * All of them are drawn in minochar and imported by `npm run import:art` (ascii/minochar/README.md has the
 * drawing rules): the pieces a scatter terrain drops (ascii/minochar/battle/pieces.minochar, into
 * terrain_pieces.ts; database/battle/terrains.ts says which terrain drops which), and the battlefields drawn
 * whole (terrain_drawings.ts), each a piece the size of its arena and a terrain of its own under the same name.
 */
import {IMPORTED_PIECES} from "./terrain_pieces";
import {IMPORTED_DRAWINGS} from "./terrain_drawings";

export interface TerrainPieceLook {
    /** the drawing, one string per row */
    art: string[];
    /** the collision mask, the same size: '#' = blocked */
    solid: string[];
    /** what the look marks for the opening, by cell: `0` the squad's start, `1` to `9` a spawn point, `P` a post
     * (see hostileOpening in lib/battle/layouts.ts) */
    markers?: { mark: string, col: number, row: number }[];
}

/** The battlefields drawn whole: each is a terrain (lib/battle/layouts.ts) and the one piece it places */
export type TerrainDrawingId = keyof typeof IMPORTED_DRAWINGS;
export const TERRAIN_DRAWINGS: Record<TerrainDrawingId, TerrainPieceLook[]> = IMPORTED_DRAWINGS;

/** Obstacle pieces: the keys of TERRAIN_PIECES below */
export type TerrainPieceId = keyof typeof IMPORTED_PIECES | TerrainDrawingId;

export const TERRAIN_PIECES: Record<TerrainPieceId, TerrainPieceLook[]> = { ...IMPORTED_PIECES, ...IMPORTED_DRAWINGS };

/** The look a placed piece wears (`look` is unset on a piece placed before pieces had more than one) */
export function terrainPieceLook(art: TerrainPieceId, look = 0): TerrainPieceLook | undefined {
    const looks = TERRAIN_PIECES[art];
    return looks && (looks[look] || looks[0]);
}
