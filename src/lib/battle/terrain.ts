/**
 * Battle terrain: what a fight is fought on, keyed by what a settlement's level declares (`terrain` in
 * database/planet/pois.ts). A terrain is scattered (a record in database/battle/scattered_terrains.ts: pieces
 * dropped at seeded spots, more of them on a bigger arena) or drawn (database/battle/drawn_terrains.ts: one
 * whole field, the arena cut to it). Either way it comes out as a list of placed pieces, and the sim (sim.ts)
 * never cares which it was.
 */
import {DRAWN_TERRAINS, TERRAIN_PIECES, terrainPieceLook, type DrawnTerrainId, type TerrainPieceId, type TerrainPieceLook} from "../../database/battle/terrain_art";
import {SCATTERED_TERRAINS, type ScatteredTerrain, type TerrainBand} from "../../database/battle/scattered_terrains";
import {ARENA_H, ARENA_W, FRONT_GAP, hash01, TERRAIN_CELL_H, TERRAIN_CELL_W, type XY} from "./arena";
import type {BattleTerrainPiece} from "./sim";

/** What a terrain marks, in arena units: where the squad starts (`0`, one or several: it splits between them), the numbered spawn points (`1` to `9`),
 * and where posts stand (`P`). See terrainMarkers. */
export interface TerrainMarkers {
    squad: XY[];
    points: { n: number, x: number, y: number }[];
    posts: XY[];
}

/** The terrains a level can name: the keys of TERRAINS */
export type TerrainId = keyof typeof TERRAINS;

type Placer = ReturnType<typeof makePlacer>;

/**
 * What a terrain marks for the opening, in arena units: the markers drawn into the looks of its placed pieces
 * (database/battle/terrain_art.ts), each at the middle of its cell.
 */
export function terrainMarkers(pieces: BattleTerrainPiece[], arenaW: number, arenaH: number): TerrainMarkers {
    const markers: TerrainMarkers = { squad: [], points: [], posts: [] };
    for (const { art, col, row, look } of pieces) {
        for (const marker of terrainPieceLook(art, look)?.markers || []) {
            const at = { x: (col + marker.col + 0.5) * TERRAIN_CELL_W, y: (row + marker.row + 0.5) * TERRAIN_CELL_H };
            if (at.x >= arenaW || at.y >= arenaH) continue;
            if (marker.mark === '0') markers.squad.push(at);
            else if (marker.mark === 'P') markers.posts.push(at);
            else markers.points.push({ n: Number(marker.mark), ...at });
        }
    }
    return markers;
}

/**
 * A terrain's layout: (arenaW, arenaH, salt) -> [{ art, col, row }], deterministic in the salt. Settlements
 * declare theirs via poi.terrain with a coord-stable salt, so a given settlement always fights on the same
 * ground and players can learn it. A scattered terrain covers a bigger arena by COUNT (its piece budget follows
 * the arena's area), never by inflating the pieces themselves; a drawn one is the size it was drawn.
 */
function terrainSize(art: TerrainPieceId, look = 0) {
    const lines = terrainPieceLook(art, look)!.solid;
    return { w: Math.max(...lines.map((l: string) => l.length)), h: lines.length };
}

// Shared placement state. tryPlace rejects out-of-bounds spots and anything within `pad` cells of an
// existing piece: 2 clear cells between pieces guarantees composed gaps stay wide enough for a body to
// physically pass (a 1-cell slit is open to the BFS but not to a unit).
function makePlacer(arenaW: number, arenaH: number) {
    const cols = Math.ceil(arenaW / TERRAIN_CELL_W);
    const rows = Math.ceil(arenaH / TERRAIN_CELL_H);
    const occupied = new Set<number>();
    const pieces: BattleTerrainPiece[] = [];
    const PAD = 2;
    return {
        cols, rows, pieces,
        tryPlace(art: TerrainPieceId, col: number, row: number, look = 0) {
            const { w, h } = terrainSize(art, look);
            if (col < 0 || row < 0 || col + w > cols || row + h > rows) return false;
            for (let c = col - PAD; c < col + w + PAD; c++) {
                for (let r = row - PAD; r < row + h + PAD; r++) {
                    if (occupied.has(r * cols + c)) return false;
                }
            }
            for (let c = col; c < col + w; c++) {
                for (let r = row; r < row + h; r++) occupied.add(r * cols + c);
            }
            pieces.push(look ? { art, col, row, look } : { art, col, row });
            return true;
        }
    };
}

// Scatters count pieces from the arts pool over the given column band via salted hash draws: the picks first
// (a piece, and which of its looks), then a spot for each, biggest first so the large pieces get the room
// they need and the small ones fill in around them. A pick gets a few tries at a spot where it fits inside the
// band and clear of what is already down; one that finds none is left out, so density degrades gracefully.
const SCATTER_TRIES = 6;
function scatterPieces(placer: Placer, arts: TerrainPieceId[], count: number, colMin: number, colMax: number, salt: number) {
    const picks = Array.from({ length: count }, (_, i) => {
        const art = arts[Math.floor(hash01(salt + i * 3) * arts.length)];
        const look = Math.floor(hash01(salt + i * 3 + 500009) * TERRAIN_PIECES[art].length);
        return { art, look, i, ...terrainSize(art, look) };
    });
    picks.sort((a, b) => b.w * b.h - a.w * a.h || a.i - b.i);
    for (const { art, look, i, w, h } of picks) {
        for (let attempt = 0; attempt < SCATTER_TRIES; attempt++) {
            const draw = salt + i * 3 + attempt * 7919;
            const col = colMin + Math.floor(hash01(draw + 1) * Math.max(1, colMax - colMin - w + 1));
            const row = 1 + Math.floor(hash01(draw + 2) * Math.max(1, placer.rows - 1 - h));
            if (placer.tryPlace(art, col, row, look)) break;
        }
    }
}

// A band's columns [from, to) on an arena this wide (see database/battle/scattered_terrains.ts). The middle strip is as
// wide as the gap between the fronts at any arena size, so it never sits on top of either side's start; the field
// leaves breathing room at both spawn ends (spawns that land on a piece are relocated by the fixup).
function bandCols(band: TerrainBand, arenaW: number): [number, number] {
    const cols = Math.ceil(arenaW / TERRAIN_CELL_W);
    const edge = Math.ceil(8 / TERRAIN_CELL_W), half = Math.round(cols / 2);
    const bandHalf = FRONT_GAP / 2 - 3;
    switch (band) {
        case 'middle': return [Math.floor((arenaW / 2 - bandHalf) / TERRAIN_CELL_W), Math.ceil((arenaW / 2 + bandHalf) / TERRAIN_CELL_W)];
        case 'left': return [edge, half];
        case 'right': return [half, cols - edge];
        case 'field': return [edge, cols - edge];
    }
}

// A scattered terrain's layout: its pieces over its band, as many as the record counts for the baseline arena
// and more on a bigger one, in proportion to the band's area (so the cover is as dense at any size).
function scatteredTerrain({ scatter, count, band }: ScatteredTerrain) {
    return (arenaW: number, arenaH: number, salt: number): BattleTerrainPiece[] => {
        const placer = makePlacer(arenaW, arenaH);
        const [from, to] = bandCols(band, arenaW);
        const [baseFrom, baseTo] = bandCols(band, ARENA_W);
        const growth = ((to - from) * arenaH) / ((baseTo - baseFrom) * ARENA_H);
        scatterPieces(placer, scatter, Math.max(1, Math.round(count * growth)), from, to, salt);
        return placer.pieces;
    };
}

type TerrainLayout = (arenaW: number, arenaH: number, salt: number) => BattleTerrainPiece[];

// A drawn terrain's layout: the drawing itself, corner to corner (the arena is cut to it, see drawnArena),
// in the look the salt picks
function drawnTerrain(id: DrawnTerrainId): TerrainLayout {
    return (arenaW, arenaH, salt) => {
        const look = Math.floor(hash01(salt + 900007) * DRAWN_TERRAINS[id].length);
        return [look ? { art: id, col: 0, row: 0, look } : { art: id, col: 0, row: 0 }];
    };
}

/** The arena a drawn terrain is fought on, whatever the armies: its canvas, cell for cell. Null for a
 * terrain that is laid out to fit the fight. */
export function drawnArena(id: TerrainId | null): { arenaW: number, arenaH: number } | null {
    const looks = id && (DRAWN_TERRAINS as Partial<Record<string, TerrainPieceLook[]>>)[id];
    if (!looks) return null;
    return { arenaW: looks[0].solid[0].length * TERRAIN_CELL_W, arenaH: Math.floor(looks[0].solid.length * TERRAIN_CELL_H) };
}

// The terrains (settlements declare theirs via poi.terrain; unset = open ground): the scattered ones
// (records in database/battle/scattered_terrains.ts) and the drawn ones (database/battle/drawn_terrains.ts).
export const TERRAINS = {
    ...(Object.fromEntries(Object.entries(SCATTERED_TERRAINS).map(([id, terrain]) => [id, scatteredTerrain(terrain)])) as Record<keyof typeof SCATTERED_TERRAINS, TerrainLayout>),
    ...(Object.fromEntries(Object.keys(DRAWN_TERRAINS).map(id => [id, drawnTerrain(id as DrawnTerrainId)])) as Record<DrawnTerrainId, TerrainLayout>)
} satisfies Record<string, TerrainLayout>;

// A scattered terrain and a drawn one cannot share a name: a level naming it could mean only one of
// them (the drawn one, the later of the two above). The import refuses the clash; so does the typecheck.
type SharedNames = keyof typeof SCATTERED_TERRAINS & DrawnTerrainId;
export const TERRAIN_NAMES_ARE_DISTINCT: [SharedNames] extends [never] ? true : { 'a scattered terrain and a drawn one share the name': SharedNames } = true;
