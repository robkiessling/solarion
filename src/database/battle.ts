/**
 * Battle content records: the stat blocks and scene text battles run on. The engine (lib/battle.ts)
 * interprets these; settlement definitions (database/pois.ts) reference the shared vocabulary by id.
 *
 * The dividing line between database/ and lib/: if a content pass would edit it, it's a record here;
 * if only a mechanics change would touch it, it's code in lib. The other battle content lives in:
 *   - database/pois.ts       -- the "levels": each settlement's difficulty, garrison, formation, terrain
 *   - database/battle_terrain.ts -- the arena obstacle art (ASCII pieces)
 * The formation and terrain-layout ids those records reference (column/ring/surround...,
 * rocks/ruins/canyon) are registries of placement algorithms in lib/battle.ts (FORMATIONS,
 * TERRAIN_LAYOUTS): new ids mean new code there, new combinations of ids are records here.
 */
import type {HostileFormation, TerrainLayoutId} from '../lib/battle';

/** The expedition droid stat block: DROID_BASE_STATS plus researched combat upgrades and the authorized chassis spec.
 * A type alias (not an interface) so it is assignable to Variables, which the upgrade effects are applied through. */
export type DroidStats = { hp: number; damage: number; attackMs: number; speed: number };

/** Hostile unit types: the keys of HOSTILE_TYPES below. Listed by hand (deriving it from the table would be circular, since
 * UnitStats.spawns names a HostileType), so keep it in step with the table. */
export type HostileType = 'defender' | 'shelter';

export type UnitType = 'droid' | HostileType;

export interface UnitStats extends DroidStats {
    /** spawner-type hostiles only */
    spawns?: HostileType;
    spawnEveryMs?: number;
    spawnBatch?: number;
    spawnCap?: number;
}

// Kill-time asymmetry is the balance dial: a stock droid is worth roughly two standard defenders, so matched
// counts win with light losses and ~1.5x defender numbers is the break-even. Defenders are faster (they rush),
// droids hit harder.
//
// Droids have BASE stats: combat upgrades modify a copy (getDroidStats in redux/reducer.ts) that is
// snapshotted onto the squad at deploy (refits apply to the next deployment, not squads in the field).
// Hostile TYPES are static definitions, never upgraded; settlements differ only in how many of each type they
// field (their composition). New types (tougher variants, bosses) are new rows here; anything with hp
// above the standard defender automatically earns an hp bar in the arena (battle_canvas.jsx).
export const DROID_BASE_STATS: DroidStats = { hp: 9, damage: 1, attackMs: 1500, speed: 9 };
export const HOSTILE_TYPES: Record<HostileType, UnitStats> = {
    defender: { hp: 6, damage: 1, attackMs: 1300, speed: 11 },
    // Spawner: a shelter the defenders come out of. Stationary and harmless (speed/damage 0 route it around the whole
    // combat loop; droids still path to it and kill it as the nearest enemy once the escorts are dead)
    // but it sends out spawnBatch fresh `spawns`-type hostiles every spawnEveryMs until killed, holding fire
    // while spawnCap non-spawner hostiles are already afield (saturation, not an unbounded flood). Winning
    // stays emergent: 'won' fires when the hostile side is empty and the shelter is on the hostile side, so "kill
    // the source or it never ends" needs no special case.
    shelter: { hp: 40, damage: 0, attackMs: 0, speed: 0, spawns: 'defender', spawnEveryMs: 4000, spawnBatch: 2, spawnCap: 24 }
};

// One-line scene descriptions for the battle footer, assembled by battleBlurb (lib/battle.ts): a ground
// clause keyed by the arena terrain layout (open = no layout) plus a hostile clause keyed by the garrison's
// formation. PLACEHOLDER copy until the content pass.
export const GROUND_BLURBS: Record<TerrainLayoutId | 'open', string> = {
    rocks: 'The squad drops into a boulder field',
    ruins: 'The squad drops among shattered ruins',
    canyon: 'The squad drops before a canyon wall',
    corridor: 'The squad advances into the tunnel',
    open: 'The squad drops onto open ground'
};
export const HOSTILE_BLURBS: Record<HostileFormation, string> = {
    column: 'hostiles advance in a broad column',
    ring: 'hostiles draw into a tight ring',
    clusters: 'hostiles mass in scattered pockets',
    scatter: 'startled hostiles rush in from every direction',
    surround: 'the ambush closes from all sides'
};
