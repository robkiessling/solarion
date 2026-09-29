/**
 * Battle-arena obstacle pieces, stamped onto the arena's terrain grid (lib/battle/sim.ts). A piece is a list
 * of looks (the placer picks one per placement); a look is its `art` (what is drawn), its `solid` mask (the
 * collision map: '#' blocks one terrain cell, about one body wide) and what it marks for the opening.
 *
 * All of them are drawn in minochar and imported by `npm run import:art` (ascii/minochar/README.md has the
 * drawing rules): the pieces a scattered terrain drops (ascii/minochar/battle/pieces.minochar, into
 * terrain_pieces.ts; database/battle/scattered_terrains.ts says which terrain drops which), and the terrains
 * drawn whole (drawn_terrains.ts), each a piece the size of its arena and a terrain under the same name.
 */
import {IMPORTED_PIECES} from "./terrain_pieces";
import {IMPORTED_DRAWN_TERRAINS} from "./drawn_terrains";

export interface TerrainPieceLook {
    /** the drawing, one string per row */
    art: string[];
    /** the collision mask, the same size: '#' = blocked */
    solid: string[];
    /** what the look marks for the opening, by cell: `0` the squad's start, `1` to `9` a spawn point, `P` a post
     * (see hostileOpening in lib/battle/openings.ts) */
    markers?: { mark: string, col: number, row: number }[];
}

/** The terrains drawn whole: each is a terrain (lib/battle/terrain.ts) and the one piece it places */
export type DrawnTerrainId = keyof typeof IMPORTED_DRAWN_TERRAINS;
export const DRAWN_TERRAINS: Record<DrawnTerrainId, TerrainPieceLook[]> = IMPORTED_DRAWN_TERRAINS;

/** Obstacle pieces: the keys of TERRAIN_PIECES below */
export type TerrainPieceId = keyof typeof IMPORTED_PIECES | DrawnTerrainId;

export const TERRAIN_PIECES: Record<TerrainPieceId, TerrainPieceLook[]> = { ...IMPORTED_PIECES, ...IMPORTED_DRAWN_TERRAINS };

// A piece and a drawn terrain cannot share a name: the drawn terrain would take the piece's place wherever a
// scattered terrain drops it. The import refuses the clash; this fails the typecheck too, naming the culprit.
type SharedNames = keyof typeof IMPORTED_PIECES & keyof typeof IMPORTED_DRAWN_TERRAINS;
export const NAMES_ARE_DISTINCT: [SharedNames] extends [never] ? true : { 'a piece and a drawn terrain share the name': SharedNames } = true;

/** The look a placed piece wears (`look` is unset on a piece placed before pieces had more than one) */
export function terrainPieceLook(art: TerrainPieceId, look = 0): TerrainPieceLook | undefined {
    const looks = TERRAIN_PIECES[art];
    return looks && (looks[look] || looks[0]);
}
