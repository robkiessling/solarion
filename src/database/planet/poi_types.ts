import {getRandomIntInclusive, mapObject} from "../../lib/helpers";
import type {HostileFormation, TerrainLayoutId} from "../../lib/battle/layouts";
import type {PlanetColorKey} from "./colors";
import type {HostileType} from "../battle/units";
import type {Capability} from "./capabilities";

/**
 * The POI vocabulary: the kinds of thing that can sit on a map tile, how each behaves when the squad
 * arrives, and how it draws. The content manifest (database/planet/pois.ts) is written in these terms; the
 * placement pass (generatePois in lib/planet/pois.ts) and the encounter flow (redux/modules/squad.ts) interpret them.
 * A new POI TYPE is a code change (contact rules, resolution, a legend row); a new combination of the
 * fields below is content.
 */

export type PoiType =
    | 'cache'      // a supply drop: take it
    | 'settlement' // where survivors live (the terminal only ever says "nest"): stepping on it starts a fight
    | 'camp'       // a few of a settlement's people out on its held ground (the terminal says "contact"): a small fight
    | 'storySite'  // a ruin with a log to read
    | 'tunnel'     // a mouth of a passage under the sea: fought through once, then crossed at will
    | 'fieldEvent' // a scene in the field (a wreck, a signal, a sighting): concealed until stepped on, answered by its choices
    | 'ambush';    // a fight in the field: concealed until stepped on, sprung (the approach card offers no Leave)

export type PoiStatus =
    | 'hidden'     // its tile has not been revealed by scouting yet (or it is concealed: see Poi.concealed)
    | 'available'  // discovered, not yet resolved
    | 'cleared';   // resolved

export interface PoiReward {
    resources?: ResourceAmounts;
    capability?: Capability;
}

/** A reward as authored: resource [lo, hi] ranges (rolled to a multiple of 100 at map generation) and/or a capability */
export interface RewardDef {
    resources?: Partial<Record<ResourceId, [number, number]>>;
    capability?: Capability;
}

/** One fight of a settlement, as authored: the garrison, its battlefield, and what falls out of it. [lo, hi] ranges
 * roll at map generation. */
export interface PoiLevelDef {
    /** standard defenders fielded (and the threat estimate's basis): a number, or a [lo, hi] range rolled at map
     * generation, so copies of a counted entry come out at mixed strengths. A level with a typed `garrison` fields
     * that roster instead and only shows this number, so give it a plain one. */
    difficulty: number | [number, number];
    formation?: HostileFormation;
    terrain?: TerrainLayoutId;
    blurb?: string;
    garrison?: Partial<Record<HostileType, number>>;
    reward?: RewardDef;
}

/** One answer on a prompted POI's popup, as authored: the button and what taking it does. A cache has no `choices`:
 * its one answer is the type's `actionLabel` (POI_TYPE_DEFAULTS), paying the cache's reward. */
export interface PoiChoiceDef {
    label: string;
    /** the result phase's narration; absent = the popup closes on the choice */
    resultText?: string;
    /** the answer's own loot; absent = the POI's `reward` */
    reward?: { resources?: Partial<Record<ResourceId, [number, number]>> };
    /** battery change on the squad, clamped to [0, capacity] */
    battery?: number;
    /** units added to the fielded roster, at full hull */
    units?: number;
    /** flips the nearest concealed POI (camp, event or ambush) to available and marks its tile */
    revealNearest?: boolean;
}

/**
 * A POI_DEFS entry: one shape per POI type, so an entry can only carry the fields its type uses and must carry
 * the text its popup shows (there are no default lines; every site says its own thing). What every shape shares
 * is where it goes and how many.
 */
interface PlacedDef {
    /** where it goes, one or the other: a random free tile of the painted zone (a-z), or of any zone in a list, or the
     * one painted point (A-Z) */
    zone?: string | string[];
    point?: string;
    /** how many to place (default 1), each on its own random tile of the zone(s); the same entry every time */
    count?: number;
    /** the map label (type default if unset) */
    name?: string;
    /** sealed until the capability is owned: the squad bumps off it */
    requires?: Capability;
}
/** A supply drop, visible once scouted: one Take */
export interface CacheDef extends PlacedDef {
    type: 'cache';
    /** the offer line ({loot} expands to the rolled reward) */
    promptText: string;
    reward: RewardDef;
}
/** A ruin with a log, visible once scouted: its answers (usually one Explore that narrates the log) */
export interface StorySiteDef extends PlacedDef {
    type: 'storySite';
    promptText: string;
    choices: PoiChoiceDef[];
    /** salvage on the site itself (a capability), paid by an answer without a reward of its own */
    reward?: RewardDef;
}
/** A camp: one fight on its settlement's held ground */
export interface CampDef extends PoiLevelDef {
    /** this camp's approach line; unset = the settlement's `campApproachText` */
    approachText?: string;
}
/** Where survivors live (the terminal says "nest"): the site's fights and its held ground. A site with camps
 * writes the line they approach with (the type enforces the pairing). */
export type SettlementDef = PlacedDef & {
    type: 'settlement';
    /** the approach card's line, shown before the fight is committed to */
    approachText: string;
    territoryRadius: number;
    /** the site's fights, surface first (one or more) */
    levels: PoiLevelDef[];
    /** built into a pre-war network facility: its number. Securing the first opens replication. */
    site?: number;
    levelsShown?: boolean;
    reloot?: number[];
    discardedKg?: [number, number];
} & (
    /** the camps seeded on this site's held ground, and the approach line they share unless one writes its own */
    { camps: CampDef[]; campApproachText: string } |
    { camps?: never; campApproachText?: never }
);
/** A scene on open ground, found by stepping on it: the offer line and its answers */
export interface EventDef extends PlacedDef {
    type: 'fieldEvent';
    /** the offer line ({loot} expands to the FIRST answer's rolled reward) */
    promptText: string;
    choices: PoiChoiceDef[];
}
/** A fight on open ground, found by stepping on it and sprung at once */
export interface AmbushDef extends PlacedDef {
    type: 'ambush';
    /** the approach card's line */
    approachText: string;
    level: PoiLevelDef;
}
export type PoiDef = CacheDef | StorySiteDef | SettlementDef | EventDef | AmbushDef;

/** A tunnel system: what holds it, and what crossing costs. Keyed by the digit painted on its two mouths. */
export interface TunnelDef {
    name?: string;
    /** the approach card's line at either mouth while the passage is still held */
    approachText: string;
    /** seals both mouths (they bump like a sealed cache) until the capability is owned */
    requires?: Capability;
    /** the fight(s) inside; the squad that wins comes out the far mouth. Empty = nobody inside, open at once
     * (or as soon as `requires` is met). Both together: sealed, then fought through once unsealed. */
    levels: PoiLevelDef[];
    /** battery the crossing costs, in flatland tiles walked */
    crossTiles: number;
}

// Per-type encounter popup mechanics (every line a popup shows is authored per site in the manifest). `actionLabel`
// is the one answer a POI without `choices` gets (a cache's Take). Taking an answer with a resultText holds the
// popup open on a result phase (story text, salvage, losses) until the player continues or drives away; one
// without closes it (the map change is the feedback). Garrisoned sites don't offer; they raise the approach card
// instead (the site's approach line, the ground line from its terrain, the threat estimate), which commits to
// the fight on Continue. A site the squad chose to walk into can be left from that card; a concealed one (a
// camp, an ambush) cannot: it is sprung. `clearedLabel` heads the popup's result line after a won fight.
//
// `reloot` is a settlement's payout schedule: the fraction of a level's rolled resources it pays by how many times
// that level has been cleared before (a site that is left resets, so its upper levels can be fought again;
// they have less each time). Past the end of the list a level pays nothing: [1] is pay-once, a long run of
// 1s is fully farmable. Capability salvage only ever happens on a level's first clear.
export const POI_TYPE_DEFAULTS: Record<PoiType, { actionLabel?: string, reloot?: number[], clearedLabel?: string }> = {
    cache: { actionLabel: 'Take' },
    storySite: {},
    tunnel: { reloot: [1], clearedLabel: 'Tunnel cleared' }, // crossed on entry once open
    settlement: { reloot: [1, 0.5, 0.25], clearedLabel: 'Nest cleared' },
    camp: { reloot: [1], clearedLabel: 'Contact cleared' },
    fieldEvent: {},
    ambush: { reloot: [1], clearedLabel: 'Ambush repelled' }
}

// Loot list wording where the resource id predates its display name
export const LOOT_LABELS: Partial<Record<ResourceId, string>> = { refinedMinerals: 'minerals' };

// Map display vocabulary (colorKeys index into PLANET_COLORS in database/planet/colors.ts; FIGHT_EFFECT_CHARS
// animate over a settlement tile while a battle runs there).
export const POI_GLYPHS: Record<PoiType, string> = { cache: '□', settlement: '▓', camp: '▒', storySite: '?', tunnel: '∩', fieldEvent: '!', ambush: '‼' }; // a density map: held ground '░' is scattered returns, a camp a knot of them, the settlement the dense core; cache: a crate; tunnel: a mouth; event and ambush: only ever seen once they have gone off
export const POI_COLOR_KEYS: Record<PoiType, PlanetColorKey> = { cache: 'poiCache', settlement: 'poiSettlement', camp: 'poiCamp', storySite: 'poiStory', tunnel: 'poiTunnel', fieldEvent: 'poiFieldEvent', ambush: 'poiFieldEvent' };
// A settlement with `site` draws as the facility the plan says is there, not as a plain return
export const SITE_GLYPH = '▣';
export const POI_LABELS: Record<PoiType, string> = { cache: 'Supply Cache', settlement: 'Nest', camp: 'Contact', storySite: 'Ruins', tunnel: 'Tunnel', fieldEvent: 'Event', ambush: 'Ambush' };
export const FIGHT_EFFECT_CHARS = ['×', '+', '*', '·'];

// Resolves a definition's reward at generation time: [lo, hi] resource ranges roll to a multiple of 100;
// capability rewards pass through unchanged.
export function rollPoiReward(rewardDef: RewardDef): PoiReward {
    const { resources, ...rest } = rewardDef;
    const reward: PoiReward = { ...rest };
    if (resources) {
        reward.resources = mapObject(resources, (resource, [lo, hi]) => getRandomIntInclusive(lo / 100, hi / 100) * 100);
    }
    return reward;
}
