/**
 * Battle-arena obstacle art: multi-line ASCII pieces stamped onto the arena's terrain grid (lib/battle.ts).
 * The drawing IS the collision map: every non-space character blocks one terrain cell (about one body
 * wide), spaces are passable. So a gap drawn into a wall plays as a doorway, and editing a piece here is
 * a gameplay change, not just a visual one.
 *
 * Authoring rules:
 * - Keep passable gaps at least 2 characters wide; a 1-char slit LOOKS open but a unit body (radius 1.2
 *   on 2-unit-wide cells) cannot physically squeeze through it.
 * - Never draw a fully enclosed hollow. A sealed interior is unreachable; anything that spawns inside
 *   (or gets relocated there) could make a battle unwinnable. The spawn fixup guards against this, but
 *   the art should not rely on it.
 * - Pieces are placed by the TERRAIN_LAYOUTS generators (lib/battle.ts); add a new piece here, then
 *   reference its key from a layout.
 */
export const TERRAIN_PIECES = {
    // Small rounded rock, the basic scatter piece
    boulder: [
        ' __ ',
        '/##\\',
        '\\__/'
    ],
    // Bigger rock for anchoring a cluster
    boulderBig: [
        '  ___  ',
        ' /###\\ ',
        '/#####\\',
        '\\_____/'
    ],
    // Tapered stone spike; narrow footprint, tall silhouette
    spire: [
        ' ^ ',
        '/|\\',
        '|||'
    ],
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
    // Breached wall: two stubs with a passable 2-cell hole between them
    ruinWall: [
        '##_  ###',
        '##   ###'
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

/** Obstacle art pieces: the keys of TERRAIN_PIECES above */
export type TerrainPieceId = keyof typeof TERRAIN_PIECES;
