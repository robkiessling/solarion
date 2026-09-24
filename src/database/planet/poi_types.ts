import {getRandomIntInclusive, mapObject} from "../../lib/helpers";
import type {HostileFormation, TerrainLayoutId} from "../../lib/battle/layouts";
import type {PlanetColorKey} from "./colors";
import type {HostileType} from "../battle/units";
import type {StoryId} from "./story_sites";

/**
 * The POI vocabulary: the kinds of thing that can sit on a map tile, how each behaves when the squad
 * arrives, and how it draws. The content manifest (database/planet/pois.ts) is written in these terms; the
 * placement pass (generatePois in lib/planet/pois.ts) and the encounter flow (redux/modules/planet.ts) interpret them.
 * A new POI TYPE is a code change (contact rules, resolution, a legend row); a new combination of the
 * fields below is content.
 */

export type PoiType =
    | 'cache'      // a supply drop: take it
    | 'settlement' // where survivors live (the terminal only ever says "nest"): stepping on it starts a fight
    | 'camp'       // a few of a settlement's people out on its held ground (the terminal says "contact"): a small fight
    | 'storySite'  // a ruin with a log to read
    | 'tunnel'     // a mouth of a passage under the sea: fought through once, then crossed at will
    | 'fieldEvent';     // a field event seeded on open ground (database/planet/field_events.ts): concealed until stepped on

export type PoiStatus =
    | 'hidden'     // its tile has not been revealed by scouting yet (or it is concealed: see Poi.concealed)
    | 'available'  // discovered, not yet resolved
    | 'cleared';   // resolved

export type Capability = 'drill' | 'overrideModule' | 'amphibious';

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
    /** settlements built into a pre-war network facility: its number. Securing the first opens replication. */
    site?: number;
    territoryRadius?: number;
    /** settlements: the site's fights, surface first (one or more) */
    levels?: PoiLevelDef[];
    levelsShown?: boolean;
    reloot?: number[];
    discardedKg?: [number, number];
    /** garrisoned sites: the approach card's line, shown before the fight is committed to (type default if unset) */
    approachText?: string;
    /** settlements: the camps seeded on this site's held ground, one single-fight level each */
    camps?: PoiLevelDef[];
    requires?: Capability;
    storyId?: StoryId;
    promptText?: string;
    actionLabel?: string;
    reward?: { resources?: Partial<Record<ResourceId, [number, number]>>; capability?: Capability };
}

/** A tunnel system: what holds it, and what crossing costs. Keyed by the digit painted on its two mouths. */
export interface TunnelDef {
    name?: string;
    /** seals both mouths (they bump like a sealed cache) until the capability is owned */
    requires?: Capability;
    /** the fight(s) inside; the squad that wins comes out the far mouth. Empty = nobody inside, open at once
     * (or as soon as `requires` is met). Both together: sealed, then fought through once unsealed. */
    levels: PoiLevelDef[];
    /** battery the crossing costs, in flatland tiles walked */
    crossTiles: number;
}

// Per-type encounter popup behavior; individual definitions override. `result` decides what accepting does:
// 'auto' resolves and closes the popup (the map change is the feedback), 'narrate' holds it open on a result
// phase (story text, salvage, losses) until the player continues or drives away. `promptText` is the offer
// line ({loot} expands to the rolled reward, see promptTextFor in lib/planet/pois.ts). Garrisoned sites don't
// offer; they raise the approach card instead (`approachText`, with the ground line and the threat estimate),
// which commits to the fight on Continue. A site the squad chose to walk into can be left from that card; a
// concealed one (a camp, an ambush) cannot: it is sprung. `clearedLabel` heads the popup's result line after
// a won fight.
//
// `reloot` is a settlement's payout schedule: the fraction of a level's rolled resources it pays by how many times
// that level has been cleared before (a site that is left resets, so its upper levels can be fought again;
// they have less each time). Past the end of the list a level pays nothing: [1] is pay-once, a long run of
// 1s is fully farmable. Capability salvage only ever happens on a level's first clear.
export const POI_TYPE_DEFAULTS: Record<PoiType, { actionLabel?: string, result: ResultBehavior, promptText?: string,
    approachText?: string, reloot?: number[], clearedLabel?: string }> = {
    cache: { actionLabel: 'Take', result: 'auto', promptText: 'Supply cache found{loot}. Take it?' },
    storySite: { actionLabel: 'Explore', result: 'narrate', promptText: 'Structure of unknown origin. Investigate?' },
    tunnel: { result: 'narrate', reloot: [1], approachText: 'Tunnel mouth. Thermal signatures in the dark beyond.', clearedLabel: 'Tunnel cleared' }, // crossed on entry once open
    settlement: { result: 'narrate', reloot: [1, 0.5, 0.25], approachText: 'Dense structural returns. Thermal signatures inside.', clearedLabel: 'Nest cleared' },
    camp: { result: 'narrate', reloot: [1], approachText: 'Contact. Movement closing on all sides.', clearedLabel: 'Contact cleared' },
    fieldEvent: { result: 'narrate', reloot: [1], approachText: 'Nearby sounds detected. Movement closing.', clearedLabel: 'Ambush repelled' } // choices carry their own labels and texts (database/planet/field_events.ts)
}

// Loot list wording where the resource id predates its display name
export const LOOT_LABELS: Partial<Record<ResourceId, string>> = { refinedMinerals: 'minerals' };

// Map display vocabulary (colorKeys index into PLANET_COLORS in database/planet/colors.ts; FIGHT_EFFECT_CHARS
// animate over a settlement tile while a battle runs there).
export const POI_GLYPHS = { cache: '□', settlement: '▓', camp: '▒', storySite: '?', tunnel: '∩', fieldEvent: '!' }; // a density map: held ground '░' is scattered returns, a camp a knot of them, the settlement the dense core; cache: a crate; tunnel: a mouth; event: only ever seen once it has gone off
export const POI_COLOR_KEYS: Record<PoiType, PlanetColorKey> = { cache: 'poiCache', settlement: 'poiSettlement', camp: 'poiCamp', storySite: 'poiStory', tunnel: 'poiTunnel', fieldEvent: 'poiFieldEvent' };
// A settlement with `site` draws as the facility the plan says is there, not as a plain return
export const SITE_GLYPH = '▣';
export const POI_LABELS = { cache: 'Supply Cache', settlement: 'Nest', camp: 'Contact', storySite: 'Ruins', tunnel: 'Tunnel', fieldEvent: 'Event' };
export const FIGHT_EFFECT_CHARS = ['×', '+', '*', '·'];

// The three tools. Stored in planet.unlockedTerrains (the shared capability set: terrain crossUpgrades and
// POI `requires` both read it), granted via upgrades or POI salvage (reward.capability).
export const CAPABILITY_LABELS: Record<Capability, string> = {
    drill: 'Plasma Drill',
    overrideModule: 'Override Module',
    amphibious: 'Amphibious Tracks'
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
