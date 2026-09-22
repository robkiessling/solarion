import {getRandomIntInclusive, mapObject} from "../lib/helpers";
import type {HostileFormation, TerrainLayoutId} from "../lib/battle";
import type {PlanetColorKey} from "../lib/planet_render";
import type {HostileType} from "./battle";

export type PoiType =
    | 'cache'      // a supply drop: take it
    | 'settlement' // where survivors live (the terminal only ever says "nest"): stepping on it starts a fight
    | 'camp'       // a few of a settlement's people out on its held ground (the terminal says "contact"): a small fight
    | 'storySite'  // a ruin with a log to read
    | 'tunnel';    // a mouth of a passage under the sea: fought through once, then crossed at will

export type PoiStatus =
    | 'hidden'     // its tile has not been revealed by scouting yet
    | 'available'  // discovered, not yet resolved
    | 'cleared';   // resolved

export type Capability = 'drill' | 'sealedChassis' | 'overrideModule' | 'pontoon';

/** What accepting an encounter popup does: 'auto' resolves and closes it, 'narrate' holds it open on a result phase */
export type ResultBehavior = 'auto' | 'narrate';

export interface PoiReward {
    resources?: ResourceAmounts;
    capability?: Capability;
}

/** One fight of a settlement, as authored: the garrison, its battlefield, and what falls out of it. [lo, hi] ranges
 * roll at map generation. */
export interface PoiLevelDef {
    difficulty: number;
    formation?: HostileFormation;
    terrain?: TerrainLayoutId;
    blurb?: string;
    garrison?: Partial<Record<HostileType, number>>;
    reward?: { resources?: Partial<Record<ResourceId, [number, number]>>; capability?: Capability };
}

/** A POI_DEFS entry: resource rewards are [lo, hi] ranges until rolled at map generation */
export interface PoiDef {
    type: PoiType;
    /** where it goes, one or the other: a random tile of the painted zone (a-z), or the one painted point (A-Z) */
    zone?: string;
    point?: string;
    name?: string;
    territoryRadius?: number;
    /** settlements: the site's fights, surface first (one or more) */
    levels?: PoiLevelDef[];
    levelsShown?: boolean;
    reloot?: number[];
    discardedKg?: [number, number];
    /** settlements: the camps seeded on this site's held ground, one single-fight level each */
    camps?: PoiLevelDef[];
    requires?: Capability;
    storyId?: StoryId;
    promptText?: string;
    actionLabel?: string;
    reward?: { resources?: Partial<Record<ResourceId, [number, number]>>; capability?: Capability };
}

/**
 * POI content definitions: WHAT exists on the planet. One POI_DEFS entry per placed POI, each naming the
 * painted zone or point of database/planet_map.txt it lands in. The placement pass (generatePois in lib/expeditions.ts) owns the
 * mechanics: zone/point lookup, reachability, territory stamping.
 *
 * Names, texts, difficulties, and rewards are PLACEHOLDERS until the content pass; this file is what that
 * pass edits.
 */

// Per-type encounter popup behavior; individual definitions override. `result` decides what accepting does:
// 'auto' resolves and closes the popup (the map change is the feedback), 'narrate' holds it open on a result
// phase (story text, salvage, losses) until the player continues or drives away. `promptText` is the offer
// line ({loot} expands to the rolled reward, see promptTextFor in lib/expeditions.ts); settlements and camps
// never prompt (the fight starts on entry).
//
// `reloot` is a settlement's payout schedule: the fraction of a level's rolled resources it pays by how many times
// that level has been cleared before (a site that is left resets, so its upper levels can be fought again;
// they have less each time). Past the end of the list a level pays nothing: [1] is pay-once, a long run of
// 1s is fully farmable. Capability salvage only ever happens on a level's first clear.
export const POI_TYPE_DEFAULTS: Record<PoiType, { actionLabel?: string, result: ResultBehavior, promptText?: string,
    reloot?: number[] }> = {
    cache: { actionLabel: 'Take', result: 'auto', promptText: 'Supply cache found{loot}. Take it?' },
    storySite: { actionLabel: 'Explore', result: 'narrate', promptText: 'Structure of unknown origin. Investigate?' },
    tunnel: { result: 'narrate', reloot: [1] }, // never prompts: fought on entry, crossed on entry once open
    settlement: { result: 'narrate', reloot: [1, 0.5, 0.25] },
    camp: { result: 'narrate', reloot: [1] }
}

// Loot list wording where the resource id predates its display name
export const LOOT_LABELS: Partial<Record<ResourceId, string>> = { refinedMinerals: 'minerals' };

// Map display vocabulary (colorKeys index into PLANET_COLORS in planet_render.ts; FIGHT_EFFECT_CHARS
// animate over a settlement tile while a battle runs there).
export const POI_GLYPHS = { cache: '□', settlement: '▓', camp: '▒', storySite: '?', tunnel: '∩' }; // a density map: held ground '░' is scattered returns, a camp a knot of them, the settlement the dense core; cache: a crate; tunnel: a mouth
export const POI_COLOR_KEYS: Record<PoiType, PlanetColorKey> = { cache: 'poiCache', settlement: 'poiSettlement', camp: 'poiCamp', storySite: 'poiStory', tunnel: 'poiTunnel' };
export const POI_LABELS = { cache: 'Supply Cache', settlement: 'Nest', camp: 'Contact', storySite: 'Ruins', tunnel: 'Tunnel' };
export const FIGHT_EFFECT_CHARS = ['×', '+', '*', '·'];

// The three tools. Stored in planet.unlockedTerrains (the shared capability set: terrain crossUpgrades and
// POI `requires` both read it), granted via upgrades or POI salvage (reward.capability).
export const CAPABILITY_LABELS: Record<Capability, string> = {
    drill: 'Plasma Drill',
    sealedChassis: 'Sealed Chassis',
    overrideModule: 'Override Module',
    pontoon: 'Pontoon Rig'
}

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
// Settlements: `levels` lists the site's fights, surface first; most have one. Each level is a full battle of its own:
//   `difficulty`  standard defenders fielded, and the displayed threat estimate
//   `garrison`    a typed garrison ({ type: count }, see HOSTILE_TYPES in database/battle.ts) fielded instead of
//                 `difficulty` standard defenders; entry order maps to formation slots, so a shelter listed first
//                 takes a ring's center
//   `formation`   the spawn layout (FORMATIONS in lib/battle.ts); unset = column front. `surround` is the
//                 ambush opening: the garrison starts in all four corners with the squad encircled
//   `terrain`     impassable obstacles scattered over the arena (TERRAIN_LAYOUTS in lib/battle.ts); unset =
//                 open ground. The battlefield is stable per level (seeded from the map coord), so it can
//                 be learned
//   `blurb`       a bespoke scene line for the battle footer; unset = generated from terrain + formation
//                 (GROUND_BLURBS/HOSTILE_BLURBS in database/battle.ts)
//   `reward`      what falls out of it
//
// Winning a level with more beneath it pauses on a descend-or-withdraw choice; the squad's hull damage and
// spent charges carry down, loot rides in cargo (kept on a withdrawal, lost on a wipe). The site only falls
// (land reclaimed, tile cleared) with its LAST level, and a site that is left re-mans itself from the top, so a
// multi-level site is one run, outfitted for in advance. `levelsShown` announces the level count up front;
// unset keeps it unknown until the bottom is reached. `discardedKg` is material the classifier weighs and
// throws away once the site has fallen: one terminal line, no value, no effect.
//
// CAMPS_ENABLED = false places no camps at all (the defs keep their `camps` lists; the placement pass skips
// them), for trying the map without them.
export const CAMPS_ENABLED = false;
// `camps` seeds small one-fight POIs on the site's held ground: foragers, herders, a watch. Visible once their
// tile is known, optional (the squad can path around them), gone for good once beaten, and a taste of the site's
// strength before committing to it. They never release land (the ground stays held until the settlement falls),
// and when it does fall whoever is still out there scatters.
//
// Loot is what scavengers hold and what they are sitting on: worked metal on top (it classifies as minerals),
// power cells further in, the old facility's stores at the core. Never ore; nothing out here mines.
// Garrisons, loot, and level counts are PLACEHOLDER tuning.
export const POI_DEFS: PoiDef[] = [
    // PLACEHOLDER zone assignment: the old distance bands mapped onto the painted zones (home basin 'a',
    // the belt around it, the far continents) until the content pass places each entry where it belongs.
    // Zone letters and their real places: see database/planet_map.txt.
    // Home basin (tutorial): one easy nest, two caches, the dead-droid story site
    { type: 'settlement', zone: 'a', territoryRadius: 1,
        levels: [
            { difficulty: 3, reward: { resources: { refinedMinerals: [100, 200] } } }
        ],
        camps: [
            { difficulty: 1, reward: { resources: { refinedMinerals: [100, 100] } } }
        ] },
    { type: 'cache', zone: 'a', reward: { resources: { ore: [500, 1000] } } },
    { type: 'cache', zone: 'a', reward: { resources: { refinedMinerals: [200, 400] } } },
    { type: 'storySite', zone: 'a', storyId: 'r1_deadDroid' },

    // The near belt: the Sealed Chassis salvage lives here so the acid beyond is crossable.
    { type: 'settlement', zone: 'b', territoryRadius: 2,
        levels: [
            { difficulty: 6, terrain: 'rocks', reward: { resources: { refinedMinerals: [300, 600] } } }
        ],
        camps: [
            { difficulty: 2, reward: { resources: { refinedMinerals: [100, 200] } } }
        ] },
    // The first two-level site, count announced: it teaches the descend-or-withdraw rule
    { type: 'settlement', zone: 'd', territoryRadius: 2, levelsShown: true, discardedKg: [80, 160],
        levels: [
            { difficulty: 10, formation: 'scatter', terrain: 'rocks',
                reward: { resources: { refinedMinerals: [400, 800] } } },
            { difficulty: 7, formation: 'clusters', terrain: 'ruins',
                reward: { resources: { refinedMinerals: [600, 1000], energy: [1000, 2000] } } }
        ],
        camps: [
            { difficulty: 3, reward: { resources: { refinedMinerals: [100, 300] } } },
            { difficulty: 3, terrain: 'rocks', reward: { resources: { refinedMinerals: [100, 300] } } }
        ] },
    { type: 'settlement', zone: 'e', territoryRadius: 2,
        levels: [
            { difficulty: 14, formation: 'clusters', terrain: 'ruins',
                reward: { resources: { refinedMinerals: [800, 1400] } } }
        ],
        camps: [
            { difficulty: 4, reward: { resources: { refinedMinerals: [200, 400] } } },
            { difficulty: 4, formation: 'scatter', reward: { resources: { refinedMinerals: [200, 400] } } }
        ] },
    { type: 'cache', zone: 'c', reward: { resources: { ore: [2000, 4000] } } },
    {
        type: 'cache', zone: 'd',
        requires: 'sealedChassis', // teased before the unlock: visible, sealed, backtrack target
        reward: { resources: { refinedMinerals: [1000, 2000] } }
    },
    { type: 'storySite', zone: 'b', storyId: 'r2_scorchedCore' },
    { type: 'storySite', zone: 'e', storyId: 'r2_chassisCache', reward: { capability: 'sealedChassis' } },

    // The far belt: the Override Module salvage; the red-herring wreckage.
    { type: 'settlement', zone: 'g', territoryRadius: 2, discardedKg: [150, 300],
        levels: [
            { difficulty: 18, formation: 'surround',
                reward: { resources: { refinedMinerals: [1200, 2000] } } },
            { difficulty: 12, terrain: 'canyon',
                reward: { resources: { refinedMinerals: [1500, 2500], energy: [3000, 5000] } } }
        ],
        camps: [
            { difficulty: 5, reward: { resources: { refinedMinerals: [300, 600] } } },
            { difficulty: 5, formation: 'surround', reward: { resources: { refinedMinerals: [300, 600] } } }
        ] },
    { type: 'settlement', zone: 'h', territoryRadius: 2, levelsShown: true, discardedKg: [200, 400],
        levels: [
            { difficulty: 24, formation: 'ring', garrison: { shelter: 1, defender: 18 }, terrain: 'canyon',
                reward: { resources: { refinedMinerals: [1500, 2500] } } },
            { difficulty: 16, formation: 'clusters', terrain: 'ruins',
                reward: { resources: { energy: [4000, 7000] } } },
            { difficulty: 14, formation: 'surround',
                reward: { resources: { refinedMinerals: [3000, 5000] } } }
        ],
        camps: [
            { difficulty: 6, reward: { resources: { refinedMinerals: [400, 800] } } },
            { difficulty: 6, terrain: 'rocks', reward: { resources: { refinedMinerals: [400, 800] } } },
            { difficulty: 6, formation: 'clusters', reward: { resources: { refinedMinerals: [400, 800] } } }
        ] },
    { type: 'cache', zone: 'k', reward: { resources: { ore: [5000, 9000] } } },
    { type: 'cache', zone: 'j', reward: { resources: { refinedMinerals: [2000, 4000] } } },
    { type: 'storySite', zone: 'g', storyId: 'r2_wreckage' },
    { type: 'storySite', zone: 'h', storyId: 'r2_overrideVault', reward: { capability: 'overrideModule' } },

    // The far continents (finale): two hard settlements, one cache, the command ruin + hive heart (story ids are placeholders)
    // The first runs three levels unannounced, and its bottom is barely defended: the largest haul on the
    // planet behind the weakest garrison, and the largest discard.
    { type: 'settlement', zone: 'q', territoryRadius: 2, discardedKg: [2300, 3500],
        levels: [
            { difficulty: 30, formation: 'scatter', terrain: 'ruins',
                reward: { resources: { refinedMinerals: [2000, 3500] } } },
            { difficulty: 22, formation: 'surround', terrain: 'ruins',
                reward: { resources: { refinedMinerals: [2500, 4000], energy: [6000, 10000] } } },
            { difficulty: 4, formation: 'clusters',
                reward: { resources: { refinedMinerals: [8000, 12000] } } }
        ],
        camps: [
            { difficulty: 8, reward: { resources: { refinedMinerals: [600, 1000] } } },
            { difficulty: 8, terrain: 'ruins', reward: { resources: { refinedMinerals: [600, 1000] } } },
            { difficulty: 8, formation: 'scatter', reward: { resources: { refinedMinerals: [600, 1000] } } }
        ] },
    { type: 'settlement', zone: 't', territoryRadius: 2, levelsShown: true, discardedKg: [400, 700],
        levels: [
            { difficulty: 40, formation: 'ring', garrison: { shelter: 2, defender: 32 }, terrain: 'canyon',
                reward: { resources: { refinedMinerals: [3000, 5000] } } },
            { difficulty: 28, formation: 'surround', terrain: 'canyon',
                reward: { resources: { refinedMinerals: [5000, 8000], energy: [10000, 15000] } } }
        ],
        camps: [
            { difficulty: 10, reward: { resources: { refinedMinerals: [800, 1400] } } },
            { difficulty: 10, terrain: 'canyon', reward: { resources: { refinedMinerals: [800, 1400] } } },
            { difficulty: 10, formation: 'surround', reward: { resources: { refinedMinerals: [800, 1400] } } }
        ] },
    { type: 'cache', zone: 'l', reward: { resources: { refinedMinerals: [5000, 8000] } } },
    { type: 'storySite', zone: 'q', storyId: 'r3_commandRuin' },
    { type: 'storySite', zone: 't', storyId: 'r3_hiveHeart' }
]

/** A tunnel system: what holds it, and what crossing costs. Keyed by the digit painted on its two mouths. */
export interface TunnelDef {
    name?: string;
    requires?: Capability;
    /** the fight(s) inside; the squad that wins comes out the far mouth */
    levels: PoiLevelDef[];
    /** battery the crossing costs, in flatland tiles walked */
    crossTiles: number;
}

// Tunnels: each digit painted on the map (two mouths per digit) is one passage. Stepping into a mouth the
// first time is the fight inside, on corridor ground (several `levels` = a long tunnel held in stages, with
// the same descend-or-withdraw choice between them as a settlement); win the last and the squad emerges at
// the far mouth, fall back and it returns the way it came. After that, stepping into either mouth crosses
// at once, for `crossTiles` of battery. A digit without an entry here gets TUNNEL_DEFAULT. PLACEHOLDER
// garrisons.
export const TUNNEL_DEFAULT: TunnelDef = { levels: [{ difficulty: 12, terrain: 'corridor' }], crossTiles: 4 };
export const TUNNEL_DEFS: Partial<Record<string, TunnelDef>> = {
    '1': { levels: [{ difficulty: 8, terrain: 'corridor', reward: { resources: { refinedMinerals: [200, 400] } } }], crossTiles: 3 },
    // '2' runs under the strait between Iberia and Morocco: the tunnel garrison, then the fortified far mouth
    '2': { levels: [
        { difficulty: 16, terrain: 'corridor', reward: { resources: { refinedMinerals: [600, 1000] } } },
        { difficulty: 20, terrain: 'corridor', formation: 'surround',
            reward: { resources: { refinedMinerals: [800, 1400] } } }
    ], crossTiles: 4 },
    '3': { levels: [{ difficulty: 20, terrain: 'corridor', reward: { resources: { refinedMinerals: [800, 1400] } } }], crossTiles: 4 },
    '4': { levels: [
        { difficulty: 14, terrain: 'corridor', reward: { resources: { refinedMinerals: [500, 900] } } },
        { difficulty: 18, terrain: 'corridor', formation: 'surround',
            reward: { resources: { refinedMinerals: [1000, 1800] } } }
    ], crossTiles: 4 }
};

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
