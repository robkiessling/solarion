/**
 * Terrain records: what each kind of ground is, how it draws, how it crosses, and what the terminal says on
 * entering it. The map module (lib/planet/map.ts) reads these; the painted map (database/planet/map.txt)
 * names terrains by glyph.
 */
import type {Capability} from "./capabilities";

/** TERRAINS[x].key (the debug meridians add `meridian_<n>` keys at runtime; they never reach a save) */
export type TerrainKey = 'home' | 'outpost' | 'flatland' | 'developing' | 'developed' | 'mountain' | 'ice' | 'shallows' | 'water';

/** How much of a tile the player has seen (the keys of STATUSES below) */
export type SectorStatus = 'unknown' | 'exploring' | 'explored';

/** The ground a squad stands on as the driver feels it (squadZone in lib/planet/squad.ts): settlement territory, the
 * powered grid, or the bare terrain. Keys the terrain notes below and the map frame's tint. */
export type SquadZone = TerrainKey | 'held' | 'grid';

export interface TerrainDef {
    key: TerrainKey;
    display: string;
    variants?: string[];
    variantShare?: number;
    label?: string;
    /** seconds for a droid to cross one tile of this terrain */
    crossTime: number;
    /** the capability the squad must hold to cross this ground at all (until then it is a wall) */
    requires?: Capability;
    /** a permanent wall: never crossed, still revealed by line of sight so the barrier can be seen */
    impassable?: boolean;
    blocksVision?: boolean;
    exploreLength?: number;
}

export interface SectorStatusDef {
    key: SectorStatus;
    display?: string;
    label: string;
}

// The fastest terrain's cross time, in seconds per tile for a scout; every other terrain is a multiple of it
// (the squad scales it down again, see SQUAD_SPEED_FACTOR in database/squad/tuning.ts).
const EXPLORATION_TIME_FACTOR = 0.5;

/**
 * crossTime: ms for a droid to cross one tile of this terrain (the movement cost / terrain weight).
 * requires: the capability (database/planet/capabilities.ts) the squad must hold to cross the terrain at all; until
 *   then it is impassable but still revealed by line-of-sight so you can see the barrier (the shallows, crossed with
 *   Amphibious Tracks).
 * impassable: a wall for good (mountains, ice, the sea). Revealed like a gated terrain, never crossed.
 * blocksVision (optional): the tile stops sight. It is revealed itself, but nothing behind it is (see
 *   getVisibleCoords). Independent of passability: a ridge you can climb with Mountaineering still hides
 *   what is on the far side.
 * variants / variantShare: a few tiles draw a variant glyph instead of the legend one (terrainGlyph in
 *   lib/planet/map.ts); the share defaults to VARIANT_SHARE there.
 * exploreLength: legacy per-tile explore cost used by the old sector-exploration model; removed once droids land.
 */
export const TERRAINS: Record<TerrainKey, TerrainDef> = {
    home: { key: 'home', display: '#', label: 'Command Center', crossTime: EXPLORATION_TIME_FACTOR },
    flatland: { key: 'flatland', display: ',', variants: ['.'], variantShare: 0.15, label: 'Flatland', crossTime: EXPLORATION_TIME_FACTOR, exploreLength: EXPLORATION_TIME_FACTOR }, // Can be developed for mining. Dust and pebbles: deliberately the quietest glyphs on the map, so features stand out against the ground
    developing: { key: 'developing', display: '+', label: 'Replicating', crossTime: EXPLORATION_TIME_FACTOR },
    developed: { key: 'developed', display: '+', label: 'Replicated', crossTime: EXPLORATION_TIME_FACTOR },
    // A secured network site: its pre-war power tap is live, so it is powered ground for the squad (recharge,
    // repair, cargo banks, scouts dock) and the survey halo reaches out from it, but it is not replicated land
    // (nothing produces here until replication builds on it). Never painted; a settlement with `site` leaves
    // one behind when it falls.
    outpost: { key: 'outpost', display: '▣', label: 'Site', crossTime: EXPLORATION_TIME_FACTOR },
    mountain: { key: 'mountain', display: 'Λ', variants: ['∧'], label: 'Mountain', crossTime: EXPLORATION_TIME_FACTOR * 3, impassable: true, blocksVision: true, exploreLength: EXPLORATION_TIME_FACTOR * 3 }, // A permanent wall; also hides what is behind it
    // ice: { key: 'ice', display: '▲', variants: ['∆'], label: 'Ice', crossTime: EXPLORATION_TIME_FACTOR * 3, impassable: true, exploreLength: EXPLORATION_TIME_FACTOR * 3 }, // White glaciers: solid peaks with the odd hollow one, a wall like the mountains but in ice
    ice: { key: 'ice', display: '*', label: 'Ice', crossTime: EXPLORATION_TIME_FACTOR * 3, impassable: true, exploreLength: EXPLORATION_TIME_FACTOR * 3 }, // A permanent wall like the mountains, in ice
    // A strait shallow enough to wade: a wall until Amphibious Tracks are researched, then slow going. Never land
    // (not surveyed, not developable), so the crossing stays a crossing.
    shallows: { key: 'shallows', display: '=', label: 'Shallows', crossTime: EXPLORATION_TIME_FACTOR * 2, requires: 'amphibious' },
    // Open water: a permanent wall like ice. The authored map's oceans; the
    // only ways across are the land the map leaves and, later, tunnels.
    water: { key: 'water', display: '~', variants: ['≈'], variantShare: 0.2, label: 'Sea', crossTime: EXPLORATION_TIME_FACTOR * 2, impassable: true },
}

// Held flatland (sector.heldBy) gets its own glyph, not just a tint (a tint alone is impossible
// to tell on the night side): a shaded zone spreading out from the settlement's '▓', the ground its
// people work and watch, the lightest shade of the same family as the camp's '▒'. (Not '·': that is the fog
// glyph, and the two would be one shape in the dark.)
// A neutral survey mark on purpose, and it holds still: anything drawn here must be literally true of a settlement's
// land (the terminal omits, it never shows a falsehood), and marks that move or glow on a tile read as
// something to walk onto. Only flatland is ever stamped held (see generatePois), so no other terrain loses
// its glyph to this.
export const HELD_GLYPH = '░';

export const STATUSES: Record<SectorStatus, SectorStatusDef> = {
    unknown: { key: 'unknown', display: '·', label: 'Unknown' },
    exploring: { key: 'exploring', label: 'Exploring' },
    explored: { key: 'explored', label: 'Explored' }
}

// Line-of-sight range of the driven squad, in hops. Sight walks the 4-neighbor adjacency graph, so an
// unobstructed blob is a diamond (12 tiles at 2 hops), not a square. Also the starting clearing around home.
export const VISION_HOPS = 3;
// Reveal range of a scout droid from the tile it stands on, in hops (same line-of-sight walk, so mountains
// wall off a scout's view too). Their lookout targeting uses the same range, so a scout never walks to a
// tile it has already fully revealed from a distance.
export const SCOUT_VISION_HOPS = 1;
// Halo radius at Survey Automation unlock (in hops; the design's R). Comms upgrades will raise the live
// value (planet state's haloRadius) later; this is just its starting point.
export const SURVEY_HALO_RADIUS = 7;

// One-line terminal notes as the squad crosses into new ground, keyed by squad zone: the terrain underfoot,
// or 'held' inside settlement territory, or 'grid' back on powered ground. Printed once per zone change, in
// the zone's map color, so the terminal carries the sense of place the ASCII map can't. Not repeated for a
// zone noted within TERRAIN_BLURB_REPEAT_MS: skirting a settlement edge or a coastline flips zones every step,
// and a round trip to a nearby site and back would otherwise replay the whole cycle; the same line three times
// in a row kills the atmosphere it's there for.
// PLACEHOLDER copy until the content pass. Zones without an entry (replicating land) print nothing.
export const TERRAIN_BLURBS: Partial<Record<SquadZone, string>> = {
    grid: 'Powered ground. Cells topping up.',
    flatland: 'Open flatland. Dust and a long horizon.',
    mountain: 'Into the mountains. Slow going; the ridges hide what lies beyond.',
    shallows: 'Shallows. Treads in the surf; the far shore is a line.',
    ice: 'Ice sheet. Wind, glare, and nothing else.',
    held: 'Hostile territory. Thermal signatures: multiple, moving.'
};
export const TERRAIN_BLURB_REPEAT_MS = 120000;

// The note for a deliberate step into ground the squad can't cross (a tap into a wall; held keys bump silently),
// keyed by the wall's terrain and printed in its map color like the notes above. Where the terrain `requires` a
// capability, the line goes on to name it (see reportBlockedTerrain in redux/modules/squad.ts); the permanent walls
// say only what they are. Same repeat window as the zone notes.
// PLACEHOLDER copy until the content pass.
export const TERRAIN_BLOCKED_BLURBS: Partial<Record<TerrainKey, string>> = {
    mountain: 'Sheer rock. No line up; the ridge stands.',
    ice: 'Ice sheet. The treads find no grip.',
    shallows: 'Shallows. Too deep for the treads.',
    water: 'The shore. Dead water to the horizon; the treads stop here.'
};
