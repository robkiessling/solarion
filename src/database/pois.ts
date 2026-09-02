import {getRandomIntInclusive} from "../lib/helpers";
import type {BugType} from './battle';
import type {GateKind} from '../lib/planet_map';
import type {NestFormation, TerrainLayoutId} from '../lib/battle';

export type PoiType =
    | 'cache'      // a supply drop: take it
    | 'nest'       // a hive: stepping on it starts a fight
    | 'storySite'  // a ruin with a log to read
    | 'gate';      // a physical barrier (cave rockfall, sealed door): impassable until opened with its capability

export type PoiStatus =
    | 'hidden'     // its tile has not been revealed by scouting yet
    | 'available'  // discovered, not yet resolved
    | 'cleared';   // resolved

export type Band = 'r1' | 'r2near' | 'r2far' | 'r3';

export type Capability = 'drill' | 'sealedChassis' | 'overrideModule';

export interface PoiReward {
    resources?: ResourceAmounts;
    capability?: Capability;
}

/** A POI_DEFS entry: resource rewards are [lo, hi] ranges until rolled at map generation */
export interface PoiDef {
    type: PoiType;
    band: Band;
    name?: string;
    difficulty?: number;
    infestRadius?: number;
    formation?: NestFormation;
    terrain?: TerrainLayoutId;
    blurb?: string;
    bugs?: Partial<Record<BugType, number>>;
    requires?: Capability;
    storyId?: string;
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
export const POI_TYPE_DEFAULTS: Record<PoiType, { actionLabel?: string, result: 'auto' | 'narrate', promptText?: string }> = {
    cache: { actionLabel: 'Take', result: 'auto', promptText: 'Supply cache found{loot}. Take it?' },
    storySite: { actionLabel: 'Explore', result: 'narrate', promptText: 'Structure of unknown origin. Investigate?' },
    gate: { actionLabel: 'Open', result: 'auto' },
    nest: { result: 'narrate' }
}

// Map display vocabulary (colorKeys index into PLANET_COLORS in planet_render.ts; FIGHT_EFFECT_CHARS
// animate over a nest tile while a battle runs there).
export const POI_GLYPHS = { cache: '□', nest: 'Ω', storySite: '?', gate: '∩' }; // cache: a crate; nest: the hive's Ω (its ground is 'ω'); gate: a cave mouth
export const POI_COLOR_KEYS = { cache: 'poiCache', nest: 'poiNest', storySite: 'poiStory', gate: 'poiGate' };
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
export const BANDS: Record<Band, Band> = {
    r1: 'r1',
    r2near: 'r2near',
    r2far: 'r2far',
    r3: 'r3'
}

// Story text lives here (not in the log database) because reports are dynamic; POIs store the key only.
// PLACEHOLDER texts: the real ~12-log mystery is authored in the content pass.
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
export const POI_DEFS: PoiDef[] = [
    // R1, the bowl (tutorial): one easy nest, two caches, the dead-droid story site
    { type: 'nest', band: BANDS.r1, difficulty: 3, infestRadius: 1 },
    { type: 'cache', band: BANDS.r1, reward: { resources: { ore: [500, 1000] } } },
    { type: 'cache', band: BANDS.r1, reward: { resources: { refinedMinerals: [200, 400] } } },
    { type: 'storySite', band: BANDS.r1, storyId: 'r1_deadDroid' },

    // R2 near (before the acid): the Sealed Chassis salvage lives HERE so the belt is crossable.
    // `formation` is the nest's battle spawn layout (FORMATIONS in lib/battle.ts); unset = column front.
    // `terrain` scatters impassable obstacles over the arena (TERRAIN_LAYOUTS in lib/battle.ts); unset =
    // open ground. The battlefield is stable per nest (seeded from its map coord), so it can be learned.
    // A nest may also declare `blurb`, a bespoke scene line for the battle footer; unset = generated from
    // its terrain + formation (GROUND_BLURBS/SWARM_BLURBS in database/battle.ts).
    { type: 'nest', band: BANDS.r2near, difficulty: 6, infestRadius: 2, terrain: 'rocks' },
    { type: 'nest', band: BANDS.r2near, difficulty: 10, infestRadius: 2, formation: 'scatter', terrain: 'rocks' },
    { type: 'nest', band: BANDS.r2near, difficulty: 14, infestRadius: 2, formation: 'clusters', terrain: 'ruins' },
    { type: 'cache', band: BANDS.r2near, reward: { resources: { ore: [2000, 4000] } } },
    {
        type: 'cache', band: BANDS.r2near,
        requires: 'sealedChassis', // teased before the unlock: visible, sealed, backtrack target
        reward: { resources: { refinedMinerals: [1000, 2000] } }
    },
    { type: 'storySite', band: BANDS.r2near, storyId: 'r2_scorchedCore' },
    { type: 'storySite', band: BANDS.r2near, storyId: 'r2_chassisCache', reward: { capability: 'sealedChassis' } },

    // R2 far (beyond the acid): the Override Module salvage; the red-herring wreckage.
    // `surround` is the ambush opening: the garrison starts in all four corners with the squad encircled.
    // `bugs` declares a typed garrison ({ type: count }, see BUG_TYPES in lib/battle.ts) instead of
    // `difficulty` standard bugs; entry order maps to formation slots, so the hive leads to take the
    // ring's center. `difficulty` remains the displayed threat estimate either way.
    { type: 'nest', band: BANDS.r2far, difficulty: 18, infestRadius: 2, formation: 'surround' },
    { type: 'nest', band: BANDS.r2far, difficulty: 24, infestRadius: 2, formation: 'ring',
        bugs: { hive: 1, bug: 18 }, terrain: 'canyon' },
    { type: 'cache', band: BANDS.r2far, reward: { resources: { ore: [5000, 9000] } } },
    { type: 'cache', band: BANDS.r2far, reward: { resources: { refinedMinerals: [2000, 4000] } } },
    { type: 'storySite', band: BANDS.r2far, storyId: 'r2_wreckage' },
    { type: 'storySite', band: BANDS.r2far, storyId: 'r2_overrideVault', reward: { capability: 'overrideModule' } },

    // R3, the antipode (finale): two hard nests, one cache, the command ruin + hive heart
    { type: 'nest', band: BANDS.r3, difficulty: 30, infestRadius: 2, formation: 'scatter', terrain: 'ruins' },
    { type: 'nest', band: BANDS.r3, difficulty: 40, infestRadius: 2, formation: 'ring',
        bugs: { hive: 2, bug: 32 }, terrain: 'canyon' },
    { type: 'cache', band: BANDS.r3, reward: { resources: { refinedMinerals: [5000, 8000] } } },
    { type: 'storySite', band: BANDS.r3, storyId: 'r3_commandRuin' },
    { type: 'storySite', band: BANDS.r3, storyId: 'r3_hiveHeart' }
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
        reward.resources = {};
        (Object.entries(resources) as [ResourceId, [number, number]][]).forEach(([resource, [lo, hi]]) => {
            reward.resources![resource] = getRandomIntInclusive(lo / 100, hi / 100) * 100;
        });
    }
    return reward;
}
