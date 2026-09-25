/**
 * Battle unit records: the stat blocks battles run on. The engine (lib/battle/sim.ts) interprets these;
 * settlement definitions (database/planet/pois.ts) reference the unit types by id.
 *
 * The dividing line between database/ and lib/: if a content pass would edit it, it's a record here;
 * if only a mechanics change would touch it, it's code in lib. The other battle content lives in:
 *   - database/planet/pois.ts     the "levels": each fight's hostiles (a count per type here), formation, terrain
 *   - database/battle/blurbs.ts   the scene text (arena footer, approach card ground line)
 *   - database/battle/terrain_art.ts  the arena obstacle art (ASCII pieces)
 * The formation and terrain-layout ids those records reference (column/ring/surround...,
 * rocks/ruins/canyon) are registries of placement algorithms in lib/battle/layouts.ts (FORMATIONS,
 * TERRAIN_LAYOUTS): new ids mean new code there, new combinations of ids are records here.
 */

/** The expedition droid stat block: DROID_BASE_STATS plus researched combat upgrades and the authorized chassis spec.
 * A type alias (not an interface) so it is assignable to Variables, which the upgrade effects are applied through. */
export type DroidStats = { hp: number; damage: number; attackMs: number; speed: number };

/** Hostile unit types: the keys of HOSTILE_TYPES below. Listed by hand (deriving it from the table would be circular, since
 * UnitStats.spawns names a HostileType), so keep it in step with the table. */
export type HostileType = 'defender' | 'shelter' | 'runner' | 'heavy' | 'mounted' | 'sentry' | 'launcher' | 'drone' | 'herd';

export type UnitType = 'droid' | HostileType;

export interface UnitStats extends DroidStats {
    /** attack reach in arena units (the arena is 100 x 60); unset = melee. A ranged unit still needs line of sight
     * past the terrain, and its hits draw as a tracer from it to the target instead of a lunge. */
    range?: number;
    /** splash radius in arena units: every enemy within it of the struck target takes the full damage (the squad's
     * bomb is the same shape at radius 10); unset = single target */
    splash?: number;
    /** the unit's one attack is itself: on reaching a target it bursts (splash, centered on the unit) and dies */
    detonates?: true;
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
// above the standard defender automatically earns an hp bar in the arena (components/battle/canvas.jsx).
export const DROID_BASE_STATS: DroidStats = { hp: 9, damage: 1, attackMs: 1500, speed: 9 };
export const HOSTILE_TYPES: Record<HostileType, UnitStats> = {
    defender: { hp: 6, damage: 1, attackMs: 1300, speed: 11 },
    // Spawner: a shelter the defenders come out of. Stationary and harmless (speed/damage 0 route it around the whole
    // combat loop; droids still path to it and kill it as the nearest enemy once the escorts are dead)
    // but it sends out spawnBatch fresh `spawns`-type hostiles every spawnEveryMs until killed, holding fire
    // while spawnCap non-spawner hostiles are already afield (saturation, not an unbounded flood). Winning
    // stays emergent: 'won' fires when the hostile side is empty and the shelter is on the hostile side, so "kill
    // the source or it never ends" needs no special case.
    shelter: { hp: 40, damage: 0, attackMs: 0, speed: 0, spawns: 'defender', spawnEveryMs: 4000, spawnBatch: 2, spawnCap: 24 },

    // The rows below are what the classifier sees, never named to the player as what they are. Each comment says
    // what it really is so the reveal stays true to every line already read. Stats are PLACEHOLDER tuning.
    // Small, fast and fragile; they reach the line first and die first. Truth: dogs running with the scavengers.
    runner: { hp: 3, damage: 1, attackMs: 900, speed: 16 },
    // A cold shell over a thermal core, slow and hard to put down; hits harder than a defender and (hp above the
    // standard defender) earns an arena hp bar. Truth: a person in salvaged pre-war armor.
    heavy: { hp: 20, damage: 2, attackMs: 1800, speed: 7 },
    // One heavy signature carrying two thermal profiles, faster than anything else afield. Truth: a rider on a horse.
    mounted: { hp: 12, damage: 2, attackMs: 1300, speed: 15 },
    // Static (speed 0: never seeks, never displaced, sits like terrain) with no thermal signature at all, and it
    // fires at range: the assault takes hits the whole way in and has to close on it to answer. Walls block its
    // shots, so terrain matters against it. Truth: a pre-war automated defense post, the kind the override module
    // was built to talk down.
    sentry: { hp: 30, damage: 2, attackMs: 1000, speed: 0, range: 22 },
    // Slow, fragile and mobile, it walks to just inside its reach and holds there, lobbing a slow shot that
    // bursts on the droid line (splash: everything near the struck droid takes the hit). Punishes a packed
    // assault; rushing it ends it. Truth: a scavenger with a salvaged pre-war grenade launcher.
    launcher: { hp: 8, damage: 3, attackMs: 3200, speed: 6, range: 18, splash: 5 },
    // The fastest signature afield and gone the moment it arrives: it runs the line and bursts on contact (splash
    // around itself), taking the nearest droids with it. Shot down short of the line it does nothing. Truth: a
    // pre-war loitering munition, salvaged and sent back out.
    drone: { hp: 2, damage: 4, attackMs: 1000, speed: 22, splash: 4, detonates: true },
    // Signatures that count on the approach card and never engage (speed 0, damage 0: routed around the whole
    // combat loop like a shelter, but spawning nothing). The fight ends only once the droids have put them down
    // too, so a camp full of them reads as more threat than it is. Truth: livestock penned on the held ground.
    herd: { hp: 4, damage: 0, attackMs: 0, speed: 0 }
};
