import {getRandomIntInclusive, mapObject} from "../lib/helpers";
import type {NestFormation, TerrainLayoutId} from "../lib/battle";
import type {GateKind} from "../lib/planet_map";
import type {PlanetColorKey} from "../lib/planet_render";
import type {BugType} from "./battle";

export type PoiType =
    | 'cache'      // a supply drop: take it
    | 'nest'       // a hive: stepping on it starts a fight
    | 'storySite'  // a ruin with a log to read
    | 'gate';      // a physical barrier (cave rockfall, sealed door): impassable until opened with its capability

export type PoiStatus =
    | 'hidden'     // its tile has not been revealed by scouting yet
    | 'available'  // discovered, not yet resolved
    | 'cleared';   // resolved

// Placement bands. R1 is the bowl (tutorial), R3 the antipode (finale). R2 is cut in half by the acid belt;
// the near/far split keeps e.g. the Sealed Chassis salvage reachable BEFORE the acid it unlocks.
export type Band = 'r1' | 'r2near' | 'r2far' | 'r3';

export type Capability = 'drill' | 'sealedChassis' | 'overrideModule';

/** What accepting an encounter popup does: 'auto' resolves and closes it, 'narrate' holds it open on a result phase */
export type ResultBehavior = 'auto' | 'narrate';

export interface PoiReward {
    resources?: ResourceAmounts;
    capability?: Capability;
}

/** One fight of a nest, as authored: the garrison, its battlefield, and what falls out of it. [lo, hi] ranges
 * roll at map generation. */
export interface NestLevelDef {
    difficulty: number;
    formation?: NestFormation;
    terrain?: TerrainLayoutId;
    blurb?: string;
    bugs?: Partial<Record<BugType, number>>;
    reward?: { resources?: Partial<Record<ResourceId, [number, number]>>; capability?: Capability };
}

/** A POI_DEFS entry: resource rewards are [lo, hi] ranges until rolled at map generation */
export interface PoiDef {
    type: PoiType;
    band: Band;
    name?: string;
    infestRadius?: number;
    /** nests: the site's fights, surface first (one or more) */
    levels?: NestLevelDef[];
    levelsShown?: boolean;
    reloot?: number[];
    discardedKg?: [number, number];
    requires?: Capability;
    storyId?: StoryId;
    promptText?: string;
    actionLabel?: string;
    reward?: { resources?: Partial<Record<ResourceId, [number, number]>>; capability?: Capability };
}

export interface GateDef {
    name: string;
    requires: Capability;
    promptText: string;
    actionLabel: string;
}

/**
 * POI content definitions: WHAT exists on the planet. One POI_DEFS entry per placed POI; gates are defined
 * per gate kind (they sit on the tiles the map-gen stamp pass marked, not in placement bands). The placement
 * pass (generatePois in lib/expeditions.ts) owns the mechanics: band selection, reachability, nest
 * infestation stamping.
 *
 * Names, texts, difficulties, and rewards are PLACEHOLDERS until the content pass; this file is what that
 * pass edits.
 */

// Per-type encounter popup behavior; individual definitions override. `result` decides what accepting does:
// 'auto' resolves and closes the popup (the map change is the feedback), 'narrate' holds it open on a result
// phase (story text, salvage, losses) until the player continues or drives away. `promptText` is the offer
// line ({loot} expands to the rolled reward, see promptTextFor in lib/expeditions.ts); gates carry theirs
// per gate kind (GATE_DEFS), nests never prompt (the fight starts on entry).
//
// `reloot` is a nest's payout schedule: the fraction of a level's rolled resources it pays by how many times
// that level has been cleared before (a site that is left resets, so its upper levels can be fought again;
// they have less each time). Past the end of the list a level pays nothing: [1] is pay-once, a long run of
// 1s is fully farmable. Capability salvage only ever happens on a level's first clear.
export const POI_TYPE_DEFAULTS: Record<PoiType, { actionLabel?: string, result: ResultBehavior, promptText?: string,
    reloot?: number[] }> = {
    cache: { actionLabel: 'Take', result: 'auto', promptText: 'Supply cache found{loot}. Take it?' },
    storySite: { actionLabel: 'Explore', result: 'narrate', promptText: 'Structure of unknown origin. Investigate?' },
    gate: { actionLabel: 'Open', result: 'auto' },
    nest: { result: 'narrate', reloot: [1, 0.5, 0.25] }
}

// Loot list wording where the resource id predates its display name
export const LOOT_LABELS: Partial<Record<ResourceId, string>> = { refinedMinerals: 'minerals' };

// Map display vocabulary (colorKeys index into PLANET_COLORS in planet_render.ts; FIGHT_EFFECT_CHARS
// animate over a nest tile while a battle runs there).
export const POI_GLYPHS = { cache: '□', nest: 'Ω', storySite: '?', gate: '∩' }; // cache: a crate; nest: the hive's Ω (its ground is 'ω'); gate: a cave mouth
export const POI_COLOR_KEYS: Record<PoiType, PlanetColorKey> = { cache: 'poiCache', nest: 'poiNest', storySite: 'poiStory', gate: 'poiGate' };
export const POI_LABELS = { cache: 'Supply Cache', nest: 'Hive Nest', storySite: 'Ruins', gate: 'Barrier' };
export const FIGHT_EFFECT_CHARS = ['×', '+', '*', '·'];

// The three tools. Stored in planet.unlockedTerrains (the shared capability set: terrain crossUpgrades and
// POI `requires` both read it), granted via upgrades or POI salvage (reward.capability).
export const CAPABILITY_LABELS: Record<Capability, string> = {
    drill: 'Plasma Drill',
    sealedChassis: 'Sealed Chassis',
    overrideModule: 'Override Module'
}

// Placement bands. R1 is the bowl (tutorial), R3 the antipode (finale). R2 is cut in half by the acid belt;
// the near/far split keeps e.g. the Sealed Chassis salvage reachable BEFORE the acid it unlocks.
// Story text lives here (not in the log database) because reports are dynamic; POIs store the key only.
// PLACEHOLDER texts: the real ~12-log mystery is authored in the content pass.
export type StoryId = keyof typeof STORY_TEXTS;
export const STORY_TEXTS = {
    r1_deadDroid: 'A droid chassis, half-buried. The model number matches your own manufacturing line. You did not build it.',
    r2_scorchedCore: 'A collapsed structure of familiar design. Its data core is scorched from the inside.',
    r2_chassisCache: 'A maintenance bay, mostly intact. One sealed hazard chassis still hangs in its cradle.',
    r2_wreckage: 'Wreckage strewn across a kilometer. The blast patterns came from above. Something attacked them.',
    r2_overrideVault: 'A command vault. Inside, an override module -- its authorization codes are older than your directive.',
    r3_commandRuin: 'The ruined command center of the first swarm. The final log is intact.',
    r3_hiveHeart: 'A vast organic chamber, pulsing faintly. The hive is not from this planet either.'
}

// Resource reward amounts are [lo, hi] ranges, rolled to a multiple of 100 at map generation (rollPoiReward).
//
// Nests: `levels` lists the site's fights, surface first; most have one. Each level is a full battle of its own:
//   `difficulty`  standard bugs fielded, and the displayed threat estimate
//   `bugs`        a typed garrison ({ type: count }, see BUG_TYPES in database/battle.ts) fielded instead of
//                 `difficulty` standard bugs; entry order maps to formation slots, so a hive listed first
//                 takes a ring's center
//   `formation`   the spawn layout (FORMATIONS in lib/battle.ts); unset = column front. `surround` is the
//                 ambush opening: the garrison starts in all four corners with the squad encircled
//   `terrain`     impassable obstacles scattered over the arena (TERRAIN_LAYOUTS in lib/battle.ts); unset =
//                 open ground. The battlefield is stable per level (seeded from the map coord), so it can
//                 be learned
//   `blurb`       a bespoke scene line for the battle footer; unset = generated from terrain + formation
//                 (GROUND_BLURBS/SWARM_BLURBS in database/battle.ts)
//   `reward`      what falls out of it
//
// Winning a level with more beneath it pauses on a descend-or-withdraw choice; the squad's hull damage and
// spent charges carry down, loot rides in cargo (kept on a withdrawal, lost on a wipe). The site only falls
// (land reclaimed, tile cleared) with its LAST level, and a site that is left re-mans itself from the top, so a
// multi-level site is one run, outfitted for in advance. `levelsShown` announces the level count up front;
// unset keeps it unknown until the bottom is reached. `discardedKg` is material the classifier weighs and
// throws away once the site has fallen: one terminal line, no value, no effect.
//
// Loot is what scavengers hold and what they are sitting on: worked metal on top (it classifies as minerals),
// power cells further in, the old facility's stores at the core. Never ore; nothing out here mines.
// Garrisons, loot, and level counts are PLACEHOLDER tuning.
export const POI_DEFS: PoiDef[] = [
    // R1, the bowl (tutorial): one easy nest, two caches, the dead-droid story site
    { type: 'nest', band: 'r1', infestRadius: 1, levels: [
        { difficulty: 3, reward: { resources: { refinedMinerals: [100, 200] } } },
        { difficulty: 3, reward: { resources: { refinedMinerals: [100, 200] } } },
    ] },
    { type: 'cache', band: 'r1', reward: { resources: { ore: [500, 1000] } } },
    { type: 'cache', band: 'r1', reward: { resources: { refinedMinerals: [200, 400] } } },
    { type: 'storySite', band: 'r1', storyId: 'r1_deadDroid' },

    // R2 near (before the acid): the Sealed Chassis salvage lives HERE so the belt is crossable.
    { type: 'nest', band: 'r2near', infestRadius: 2, levels: [
        { difficulty: 6, terrain: 'rocks', reward: { resources: { refinedMinerals: [300, 600] } } }
    ] },
    // The first two-level site, count announced: it teaches the descend-or-withdraw rule
    { type: 'nest', band: 'r2near', infestRadius: 2, levelsShown: true, discardedKg: [80, 160], levels: [
        { difficulty: 10, formation: 'scatter', terrain: 'rocks',
            reward: { resources: { refinedMinerals: [400, 800] } } },
        { difficulty: 7, formation: 'clusters', terrain: 'ruins',
            reward: { resources: { refinedMinerals: [600, 1000], energy: [1000, 2000] } } }
    ] },
    { type: 'nest', band: 'r2near', infestRadius: 2, levels: [
        { difficulty: 14, formation: 'clusters', terrain: 'ruins',
            reward: { resources: { refinedMinerals: [800, 1400] } } }
    ] },
    { type: 'cache', band: 'r2near', reward: { resources: { ore: [2000, 4000] } } },
    {
        type: 'cache', band: 'r2near',
        requires: 'sealedChassis', // teased before the unlock: visible, sealed, backtrack target
        reward: { resources: { refinedMinerals: [1000, 2000] } }
    },
    { type: 'storySite', band: 'r2near', storyId: 'r2_scorchedCore' },
    { type: 'storySite', band: 'r2near', storyId: 'r2_chassisCache', reward: { capability: 'sealedChassis' } },

    // R2 far (beyond the acid): the Override Module salvage; the red-herring wreckage.
    { type: 'nest', band: 'r2far', infestRadius: 2, discardedKg: [150, 300], levels: [
        { difficulty: 18, formation: 'surround',
            reward: { resources: { refinedMinerals: [1200, 2000] } } },
        { difficulty: 12, terrain: 'canyon',
            reward: { resources: { refinedMinerals: [1500, 2500], energy: [3000, 5000] } } }
    ] },
    { type: 'nest', band: 'r2far', infestRadius: 2, levelsShown: true, discardedKg: [200, 400], levels: [
        { difficulty: 24, formation: 'ring', bugs: { hive: 1, bug: 18 }, terrain: 'canyon',
            reward: { resources: { refinedMinerals: [1500, 2500] } } },
        { difficulty: 16, formation: 'clusters', terrain: 'ruins',
            reward: { resources: { energy: [4000, 7000] } } },
        { difficulty: 14, formation: 'surround',
            reward: { resources: { refinedMinerals: [3000, 5000] } } }
    ] },
    { type: 'cache', band: 'r2far', reward: { resources: { ore: [5000, 9000] } } },
    { type: 'cache', band: 'r2far', reward: { resources: { refinedMinerals: [2000, 4000] } } },
    { type: 'storySite', band: 'r2far', storyId: 'r2_wreckage' },
    { type: 'storySite', band: 'r2far', storyId: 'r2_overrideVault', reward: { capability: 'overrideModule' } },

    // R3, the antipode (finale): two hard nests, one cache, the command ruin + hive heart
    // The first runs three levels unannounced, and its bottom is barely defended: the largest haul on the
    // planet behind the weakest garrison, and the largest discard.
    { type: 'nest', band: 'r3', infestRadius: 2, discardedKg: [2300, 3500], levels: [
        { difficulty: 30, formation: 'scatter', terrain: 'ruins',
            reward: { resources: { refinedMinerals: [2000, 3500] } } },
        { difficulty: 22, formation: 'surround', terrain: 'ruins',
            reward: { resources: { refinedMinerals: [2500, 4000], energy: [6000, 10000] } } },
        { difficulty: 4, formation: 'clusters',
            reward: { resources: { refinedMinerals: [8000, 12000] } } }
    ] },
    { type: 'nest', band: 'r3', infestRadius: 2, levelsShown: true, discardedKg: [400, 700], levels: [
        { difficulty: 40, formation: 'ring', bugs: { hive: 2, bug: 32 }, terrain: 'canyon',
            reward: { resources: { refinedMinerals: [3000, 5000] } } },
        { difficulty: 28, formation: 'surround', terrain: 'canyon',
            reward: { resources: { refinedMinerals: [5000, 8000], energy: [10000, 15000] } } }
    ] },
    { type: 'cache', band: 'r3', reward: { resources: { refinedMinerals: [5000, 8000] } } },
    { type: 'storySite', band: 'r3', storyId: 'r3_commandRuin' },
    { type: 'storySite', band: 'r3', storyId: 'r3_hiveHeart' }
]

// Gate POIs, one definition per gate kind (the map-gen stamp pass marks sector.gated/gateKind tiles).
export const GATE_DEFS: Record<GateKind, GateDef> = {
    cave: {
        name: 'Collapsed Cave',
        requires: 'drill',
        promptText: 'The only pass through the ring is choked with rockfall. Drill through?',
        actionLabel: 'Drill'
    },
    door: {
        name: 'Sealed Bulkhead',
        requires: 'overrideModule',
        promptText: 'A first-swarm bulkhead, still powered. The override module interfaces cleanly. Open it?',
        actionLabel: 'Open'
    }
}

// Resolves a definition's reward at generation time: [lo, hi] resource ranges roll to a multiple of 100;
// capability rewards pass through unchanged.
export function rollPoiReward(rewardDef: NonNullable<PoiDef['reward']>): PoiReward {
    const { resources, ...rest } = rewardDef;
    const reward: PoiReward = { ...rest };
    if (resources) {
        reward.resources = mapObject(resources, (resource, [lo, hi]) => getRandomIntInclusive(lo / 100, hi / 100) * 100);
    }
    return reward;
}
