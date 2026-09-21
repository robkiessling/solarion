import {getRandomFromArray, getRandomIntInclusive, mapObject} from "./helpers";
import {ACID_BAND_DISTANCES, getCrossTime, getHomeBasePosition, STATUSES, TERRAINS, type PlanetMap, type Sector} from "./planet_map";
import {getAdjacentCoords, getCoordsWithinHops} from "./planet_geometry";
import {GATE_DEFS, LOOT_LABELS, POI_DEFS, POI_LABELS, POI_TYPE_DEFAULTS, rollPoiReward, type Band, type Capability, type NestLevelDef, type PoiDef, type PoiReward, type PoiStatus, type PoiType, type ResultBehavior, type StoryId} from "../database/pois";
import type {BugType} from "../database/battle";
import type {NestFormation, TerrainLayoutId} from "./battle";

/** One fight of a placed nest (see NestLevelDef in database/pois.ts), rewards rolled. `timesCleared` counts
 * wins on this level across assaults: it indexes the site's reloot schedule. */
export interface NestLevel {
    difficulty: number;
    formation?: NestFormation;
    terrain?: TerrainLayoutId;
    blurb?: string;
    bugs?: Partial<Record<BugType, number>>;
    reward: PoiReward;
    timesCleared: number;
}

/** A placed POI in planet.pois */
export interface Poi {
    id: string;
    coord: Coord;
    type: PoiType;
    name: string;
    status: PoiStatus;
    distance: number;
    requires: Capability | null;
    difficultyKnown: boolean;
    reward: PoiReward;
    infestRadius?: number;
    storyId?: StoryId;
    promptText?: string;
    actionLabel?: string;
    resultBehavior?: ResultBehavior;
    /** nests: the site's fights, surface first (one or more) */
    levels?: NestLevel[];
    levelsShown?: boolean;
    reloot?: number[];
    discardedKg?: number;
}

/**
 * This module owns the point-of-interest (POI) domain logic: POI placement mechanics, encounter resolution
 * math, and report text. WHAT gets placed (counts, rewards, story text) is data in database/pois.ts; squad
 * movement/driving lives in squad.ts (the squad is player-driven).
 */

// POI content records (types, texts, labels, glyphs) live in database/pois.ts; re-exported here so
// consumers keep one import site.
export {CAPABILITY_LABELS, FIGHT_EFFECT_CHARS, POI_COLOR_KEYS, POI_GLYPHS, POI_LABELS, STORY_TEXTS} from "../database/pois";

/**
 * The region/stamp placement pass: the POI_DEFS content manifest scattered per placement band, gate POIs on
 * the stamped gate tiles, and an infestation stamp around every nest (sector.infestedBy: scout-impassable,
 * not developable, squad-crossable; retracts when the nest is cleared). MUTATES the map (generation-time
 * only).
 */
export function generatePois(map: PlanetMap): Record<string, Poi> {
    const pois: Record<string, Poi> = {};
    const usedKeys = new Set();

    const bandOf = (sector: Sector): Band => {
        if (sector.region === 'bowl') return 'r1';
        if (sector.region === 'antipode') return 'r3';
        return sector.graphDistanceHome < ACID_BAND_DISTANCES[0] ? 'r2near' : 'r2far';
    };

    // Only place POIs where a fully-tooled squad can actually walk (gates treated as open, acid as
    // crossable). Scenery mountain ranges leave pockets, and a capability salvage inside one would make the
    // seed unfinishable; the map-gen corridor carve guarantees each region has reachable ground.
    const reachable = squadReachableSet(map);

    const candidates: Sector[] = [];
    map.forEach(row => {
        row.forEach(sector => {
            if (sector.terrain === TERRAINS.flatland.key && sector.graphDistanceHome > 2 &&
                !sector.gated && reachable.has(`${sector.coord[0]},${sector.coord[1]}`)) {
                candidates.push(sector);
            }
        });
    });

    const pick = (band: Band): Sector | null => {
        const pool = candidates.filter(sector =>
            bandOf(sector) === band &&
            !sector.infestedBy && // never place on (or roll a nest whose center is inside) existing infestation
            !usedKeys.has(`${sector.coord[0]},${sector.coord[1]}`)
        );
        if (pool.length === 0) return null; // rare degenerate roll; the harness watches placement counts
        const sector = getRandomFromArray(pool);
        usedKeys.add(`${sector.coord[0]},${sector.coord[1]}`);
        return sector;
    };

    const add = (type: PoiType, sector: Sector, extras: Partial<Poi> = {}): Poi => {
        const id = `poi_${sector.coord[0]}_${sector.coord[1]}`;
        pois[id] = {
            id,
            coord: sector.coord,
            type,
            name: POI_LABELS[type],
            // Discovery normally happens when scouting reveals the tile; a POI born on already-explored
            // ground (the home ring, or an EXPLORE_EVERYTHING debug map) would otherwise stay hidden forever
            status: sector.status === STATUSES.explored.key ? 'available' : 'hidden',
            distance: sector.graphDistanceHome, // cached for display/sorting (static once the map is generated)
            requires: null,
            difficultyKnown: false,
            reward: {},
            ...extras
        };
        return pois[id];
    };

    // A nest additionally stamps its infestation radius (flatland only; mountains/acid are barriers already).
    // Placement requires clean ground out to radius+1, so stamps never overlap (retraction assumes one owner).
    const addNest = (def: PoiDef) => {
        for (let attempt = 0; attempt < 20; attempt++) {
            const sector = pick(def.band);
            if (!sector) return;
            const infestRadius = def.infestRadius ?? 0;
            const area = [sector.coord, ...getCoordsWithinHops(sector.coord, infestRadius + 1)];
            const clean = area.every(([r, c]) => !map[r][c].infestedBy && !map[r][c].gated &&
                map[r][c].terrain !== TERRAINS.home.key);
            if (!clean) continue; // pick() already marked it used; just try another tile

            const poi = add('nest', sector, { infestRadius, levels: (def.levels || []).map(rollNestLevel),
                levelsShown: def.levelsShown, reloot: def.reloot });
            if (def.discardedKg) poi.discardedKg = getRandomIntInclusive(def.discardedKg[0] / 10, def.discardedKg[1] / 10) * 10;
            [sector.coord, ...getCoordsWithinHops(sector.coord, infestRadius)].forEach(([r, c]) => {
                if (map[r][c].terrain === TERRAINS.flatland.key && !map[r][c].gated) {
                    map[r][c].infestedBy = poi.id;
                }
            });
            return;
        }
    };

    // Gate POIs sit on the tiles the stamp pass marked (sector.gated/gateKind)
    map.forEach(row => {
        row.forEach(sector => {
            if (!sector.gated || !sector.gateKind) return;
            usedKeys.add(`${sector.coord[0]},${sector.coord[1]}`);
            add('gate', sector, { ...GATE_DEFS[sector.gateKind] });
        });
    });

    // The content manifest: each definition placed in its band, rewards rolled from their declared ranges
    POI_DEFS.forEach(def => {
        if (def.type === 'nest') {
            addNest(def);
            return;
        }
        const extras: Partial<Poi> = {};
        if (def.name) extras.name = def.name;
        if (def.requires) extras.requires = def.requires;
        if (def.storyId) extras.storyId = def.storyId;
        if (def.promptText) extras.promptText = def.promptText;
        if (def.actionLabel) extras.actionLabel = def.actionLabel;
        if (def.reward) extras.reward = rollPoiReward(def.reward);
        const sector = pick(def.band);
        if (sector) add(def.type, sector, extras);
    });

    return pois;
}

function rollNestLevel(def: NestLevelDef): NestLevel {
    return { difficulty: def.difficulty, formation: def.formation, terrain: def.terrain,
        blurb: def.blurb, bugs: def.bugs, reward: def.reward ? rollPoiReward(def.reward) : {}, timesCleared: 0 };
}

// A nest's fights, surface first (empty for other POI types)
export function nestLevels(poi: Poi): NestLevel[] {
    return poi.levels || [];
}

/** A nest as saves stored it before levels existed: its one fight in the POI's own fields */
type LegacyNest = Poi & { difficulty?: number | null } & Pick<NestLevel, 'formation' | 'terrain' | 'blurb' | 'bugs'>;

// Save repair: folds a pre-levels nest's own fight fields into a single level (mutates; see save_migration.ts).
// A nest already cleared keeps its one level marked as fallen.
export function migrateLegacyNest(poi: Poi) {
    if (poi.type !== 'nest' || poi.levels) return;
    const legacy = poi as LegacyNest;
    poi.levels = [{ difficulty: legacy.difficulty || 0, formation: legacy.formation, terrain: legacy.terrain,
        blurb: legacy.blurb, bugs: legacy.bugs, reward: {}, timesCleared: poi.status === 'cleared' ? 1 : 0 }];
    delete legacy.difficulty;
    delete legacy.formation;
    delete legacy.terrain;
    delete legacy.blurb;
    delete legacy.bugs;
}

// What winning a level pays on THIS clear: its rolled resources scaled by the site's reloot schedule (indexed by
// how often the level has fallen before; past the end it pays nothing). Salvage is first-clear only.
export function nestLevelPayout(poi: Poi, levelIndex: number): PoiReward {
    const level = nestLevels(poi)[levelIndex];
    const schedule = poi.reloot || POI_TYPE_DEFAULTS.nest.reloot || [1];
    const fraction = schedule[level.timesCleared] ?? 0;
    const reward: PoiReward = {};
    if (level.reward.resources && fraction > 0) {
        reward.resources = mapObject(level.reward.resources, (resource, amount) => Math.floor(amount * fraction));
    }
    if (level.reward.capability && level.timesCleared === 0) reward.capability = level.reward.capability;
    return reward;
}

// Every tile a fully-tooled squad can reach from home: BFS over terrain crossable with all capabilities,
// through gate tiles (they're flatland; the gate POI is the openable barrier). Keys are "row,col".
function squadReachableSet(map: PlanetMap): Set<string> {
    const home = getHomeBasePosition(map).coord;
    const allTools = { drill: true, sealedChassis: true, overrideModule: true };

    const reachable = new Set([`${home[0]},${home[1]}`]);
    let frontier = [home];
    while (frontier.length > 0) {
        const next: Coord[] = [];
        frontier.forEach(coord => {
            getAdjacentCoords(coord).forEach(([r, c]) => {
                const key = `${r},${c}`;
                if (reachable.has(key)) return;
                if (getCrossTime(map[r][c].terrain, allTools) === Infinity) return;
                reachable.add(key);
                next.push([r, c]);
            });
        });
        frontier = next;
    }
    return reachable;
}

// "500 ore, 200 energy" (empty string when there's nothing)
export function formatResourceList(resources: ResourceAmounts): string {
    if (!resources) return '';
    return Object.entries(resources)
        .map(([resource, amount]) => `${amount} ${LOOT_LABELS[resource as ResourceId] || resource}`).join(', ');
}

/**
 * Encounter popup content accessors: definition field if present, else the type default (POI_TYPE_DEFAULTS
 * in database/pois.ts). Prompt texts are templates; {loot} expands to the POI's rolled reward.
 */

export function promptTextFor(poi: Poi): string {
    const template = poi.promptText || POI_TYPE_DEFAULTS[poi.type].promptText || '';
    const loot = poi.reward && poi.reward.resources ? ` — ${formatResourceList(poi.reward.resources)}` : '';
    return template.replace('{loot}', loot);
}

export function actionLabelFor(poi: Poi): string {
    return poi.actionLabel || POI_TYPE_DEFAULTS[poi.type].actionLabel || 'Explore';
}

// 'auto' (resolve and close) | 'narrate' (hold the popup open on a result phase)
export function resultBehaviorFor(poi: Poi): ResultBehavior {
    return poi.resultBehavior || POI_TYPE_DEFAULTS[poi.type].result;
}

// Difficulty shown as a band until a squad has made contact (first fight reveals the exact number).
export function estimateDifficultyRange(difficulty: number): [number, number] {
    const lo = Math.floor((difficulty - 1) / 3) * 3 + 1;
    return [lo, lo + 2];
}


