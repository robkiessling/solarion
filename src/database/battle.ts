/**
 * Battle content records: the stat blocks and scene text battles run on. The engine (lib/battle.ts)
 * interprets these; nest definitions (database/pois.ts) reference the shared vocabulary by id.
 *
 * The dividing line between database/ and lib/: if a content pass would edit it, it's a record here;
 * if only a mechanics change would touch it, it's code in lib. The other battle content lives in:
 *   - database/pois.ts       -- the "levels": each nest's difficulty, garrison (bugs), formation, terrain
 *   - database/battle_terrain.ts -- the arena obstacle art (ASCII pieces)
 * The formation and terrain-layout ids those records reference (column/ring/surround...,
 * rocks/ruins/canyon) are registries of placement algorithms in lib/battle.ts (FORMATIONS,
 * TERRAIN_LAYOUTS): new ids mean new code there, new combinations of ids are records here.
 */

// Kill-time asymmetry is the balance dial: a stock droid is worth roughly two standard bugs, so matched
// counts win with light losses and ~1.5x bug numbers is the break-even. Bugs are faster (they swarm),
// droids hit harder.
//
// Droids have BASE stats: combat upgrades modify a copy (getDroidStats in redux/reducer.ts) that is
// snapshotted onto the squad at deploy (refits apply to the next deployment, not squads in the field).
// Bug TYPES are static definitions, never upgraded; nests differ only in how many of each type they
// field (their composition). New types (tougher variants, bosses) are new rows here; anything with hp
// above the standard bug automatically earns an hp bar in the arena (battle_canvas.jsx).
export const DROID_BASE_STATS: DroidStats = { hp: 9, damage: 1, attackMs: 1500, speed: 9 };
export const BUG_TYPES: Record<BugType, UnitStats> = {
    bug: { hp: 6, damage: 1, attackMs: 1300, speed: 11 },
    // Spawner: the hive mouth itself. Stationary and harmless (speed/damage 0 route it around the whole
    // combat loop; droids still path to it and kill it as the nearest enemy once the escorts are dead)
    // but it disgorges spawnBatch fresh `spawns`-type bugs every spawnEveryMs until killed, holding fire
    // while spawnCap non-spawner bugs are already afield (saturation, not an unbounded swarm). Winning
    // stays emergent: 'won' fires when the bug side is empty and the hive is on the bug side, so "kill
    // the source or it never ends" needs no special case.
    hive: { hp: 40, damage: 0, attackMs: 0, speed: 0, spawns: 'bug', spawnEveryMs: 4000, spawnBatch: 2, spawnCap: 24 }
};

// One-line scene descriptions for the battle footer, assembled by battleBlurb (lib/battle.ts): a ground
// clause keyed by the arena terrain layout (open = no layout) plus a swarm clause keyed by the garrison's
// formation. PLACEHOLDER copy until the content pass.
export const GROUND_BLURBS: Record<TerrainLayoutId | 'open', string> = {
    rocks: 'The squad drops into a boulder field',
    ruins: 'The squad drops among shattered ruins',
    canyon: 'The squad drops before a canyon wall',
    open: 'The squad drops onto open ground'
};
export const SWARM_BLURBS: Record<NestFormation, string> = {
    column: 'the swarm advances in a broad column',
    ring: 'the swarm coils into a tight ring',
    clusters: 'bugs mass in scattered pockets',
    scatter: 'startled bugs swarm from every direction',
    surround: 'the ambush closes from all sides'
};
