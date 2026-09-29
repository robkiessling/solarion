/**
 * Battle-arena obstacle pieces, stamped onto the arena's terrain grid (lib/battle/sim.ts). A piece is a list
 * of looks (the placer picks one per placement); a look is its `art` (what is drawn) and its `solid` mask
 * (the collision map: '#' blocks one terrain cell, about one body wide).
 *
 * Pieces are drawn in minochar (ascii/minochar/battle/pieces.minochar) and imported by `npm run import:art`
 * into terrain_pieces.ts; ascii/minochar/README.md has the drawing rules. The ones below are the hand-written
 * pieces that have not been redrawn yet: in these every character blocks, so a gap drawn into a wall plays as
 * a doorway, and editing one is a gameplay change, not just a visual one.
 * - Keep passable gaps at least 2 characters wide; a 1-char slit LOOKS open but a unit body (radius 1.2
 *   on 2-unit-wide cells) cannot physically squeeze through it.
 * - Never draw a fully enclosed hollow. A sealed interior is unreachable; anything that spawns inside
 *   (or gets relocated there) could make a battle unwinnable. The spawn fixup guards against this, but
 *   the art should not rely on it.
 * - Pieces are placed by the terrain records (database/battle/terrains.ts) and the TERRAIN_LAYOUTS generators
 *   (lib/battle/layouts.ts): add a piece, then reference its key from one of them.
 */
import {IMPORTED_PIECES} from "./terrain_pieces";

export interface TerrainPieceLook {
    /** the drawing, one string per row */
    art: string[];
    /** the collision mask, the same size: '#' = blocked */
    solid: string[];
}

const HAND_WRITTEN = {
    // Straight wall segments; the canyon layout tiles wallV into long runs
    wallH: [
        '######',
        '######'
    ],
    wallV: [
        '##',
        '##',
        '##',
        '##'
    ],
    // Free-standing gateway; the 3-cell gap is a deliberate mini-choke
    arch: [
        '##   ##',
        '##   ##',
        '##   ##'
    ],
    // C-shaped ruin, open to the south; cover you can stand inside
    bunker: [
        '#########',
        '#########',
        '##     ##',
        '##     ##'
    ]
} satisfies Record<string, string[]>;

const asLook = (art: string[]): TerrainPieceLook => ({ art, solid: art.map(line => line.replace(/\S/g, '#')) });

/** Obstacle pieces: the keys of TERRAIN_PIECES below */
export type TerrainPieceId = keyof typeof HAND_WRITTEN | keyof typeof IMPORTED_PIECES;

export const TERRAIN_PIECES: Record<TerrainPieceId, TerrainPieceLook[]> = {
    ...(Object.fromEntries(Object.entries(HAND_WRITTEN).map(([id, art]) => [id, [asLook(art)]])) as Record<keyof typeof HAND_WRITTEN, TerrainPieceLook[]>),
    ...IMPORTED_PIECES
};

/** The look a placed piece wears (`look` is unset on a piece placed before pieces had more than one) */
export function terrainPieceLook(art: TerrainPieceId, look = 0): TerrainPieceLook | undefined {
    const looks = TERRAIN_PIECES[art];
    return looks && (looks[look] || looks[0]);
}
