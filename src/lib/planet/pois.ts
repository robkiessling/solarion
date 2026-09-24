import {getRandomFromArray, getRandomIntInclusive, mapObject} from "../helpers";
import {getCrossTime, getHomeBasePosition, type PlanetMap, type Sector} from "./map";
import {getAdjacentCoords, getCoordsWithinHops} from "./geometry";
import {STATUSES, TERRAINS, VISION_HOPS} from "../../database/planet/terrain";
import {LOOT_LABELS, POI_LABELS, POI_TYPE_DEFAULTS, rollPoiReward, type FieldEventChoiceDef, type PoiLevelDef, type PoiDef, type PoiReward, type PoiStatus, type PoiType, type ResultBehavior} from "../../database/planet/poi_types";
import {CAMPS_ENABLED, FIELD_EVENT_SPACING, POI_DEFS, TUNNEL_DEFAULT, TUNNEL_DEFS} from "../../database/planet/pois";
import type {StoryId} from "../../database/planet/story_sites";
import type {Capabilities, Capability} from "../../database/planet/capabilities";
import type {HostileType} from "../../database/battle/units";
import type {HostileFormation, TerrainLayoutId} from "../battle/layouts";

/** One fight of a placed settlement (see PoiLevelDef in database/planet/poi_types.ts), rewards rolled. `timesCleared` counts
 * wins on this level across assaults: it indexes the site's reloot schedule. */
export interface PoiLevel {
    difficulty: number;
    formation?: HostileFormation;
    terrain?: TerrainLayoutId;
    blurb?: string;
    garrison?: Partial<Record<HostileType, number>>;
    reward: PoiReward;
    timesCleared: number;
}

/** One answer to a field event, rewards rolled (see FieldEventChoiceDef in database/planet/poi_types.ts) */
export interface FieldEventChoice {
    label: string;
    resultText?: string;
    reward?: PoiReward;
    battery?: number;
    units?: number;
    revealNearest?: boolean;
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
    territoryRadius?: number;
    storyId?: StoryId;
    promptText?: string;
    approachText?: string;
    actionLabel?: string;
    resultBehavior?: ResultBehavior;
    /** settlements: the site's fights, surface first (one or more) */
    levels?: PoiLevel[];
    levelsShown?: boolean;
    reloot?: number[];
    discardedKg?: number;
    /** settlements on a pre-war network facility: its number (see PoiDef.site) */
    site?: number;
    /** camps: the settlement whose held ground this sits on */
    parentId?: string;
    /** stays hidden when its tile is scouted; found by stepping on it (camps, field events) */
    concealed?: boolean;
    /** field events: the popup's answers (an ambush has `levels` instead) */
    choices?: FieldEventChoice[];
    /** tunnels: the painted digit, the far mouth, whether the passage has been fought through, crossing cost */
    tunnel?: string;
    exitCoord?: Coord;
    open?: boolean;
    crossTiles?: number;
}

/**
 * This module owns the point-of-interest (POI) domain logic: POI placement mechanics, encounter resolution
 * math, and prompt text. WHAT gets placed (counts, rewards, story text) is data in database/planet/pois.ts,
 * written in the vocabulary of database/planet/poi_types.ts; squad movement/driving lives in squad.ts (the
 * squad is player-driven).
 */

/**
 * The placement pass: each POI_DEFS entry lands in its zone (a random free tile of it, or of any zone in its
 * list) or on its point (one exact tile) painted in the authored map, `count` times; a tunnel POI on every
 * painted mouth; and a territory stamp around every settlement (sector.heldBy: scout-impassable, not
 * developable, squad-crossable; retracts when the settlement is cleared). Field events keep FIELD_EVENT_SPACING
 * hops from each other. An entry that cannot be placed (in full) is reported on the console rather than
 * dropped silently: the manifest is the content plan, and a missing entry is a bug in the drawing or the
 * manifest.
 * MUTATES the map (generation-time only).
 */
export function generatePois(map: PlanetMap): Record<string, Poi> {
    const pois: Record<string, Poi> = {};
    const usedKeys = new Set();

    // Only place POIs where a fully-tooled squad can actually walk (shallows and tunnels open). A capability salvage in a pocket walled off by mountains or sea would make the map
    // unfinishable.
    const reachable = squadReachableSet(map);

    // Nothing starts in sight of home: the ground within VISION_HOPS is explored from the first frame, and a site
    // born there is "sighted" before the player has done anything (the sighting triggers would fire at once).
    const beyondStartingVision = (sector: Sector) => sector.graphDistanceHome > VISION_HOPS;
    const candidates: Sector[] = [];
    map.forEach(row => {
        row.forEach(sector => {
            if (sector.terrain === TERRAINS.flatland.key && beyondStartingVision(sector) &&
                reachable.has(`${sector.coord[0]},${sector.coord[1]}`)) {
                candidates.push(sector);
            }
        });
    });

    const describe = (def: PoiDef) => `${def.name || def.type}${def.point ? ` at point ${def.point}` :
        ` in zone ${Array.isArray(def.zone) ? def.zone.join('/') : def.zone}`}${(def.count ?? 1) > 1 ? ` (x${def.count})` : ''}`;

    // A random free tile of the def's zone(s), or its point's tile. Territory never overlaps a placed POI
    // (a settlement rolled inside another's stamp would share ground; a cache under one would be unreachable
    // to scouts), so held tiles are out of the pool. Field events also keep their spacing from each other.
    const eventKeys = new Set<string>();
    const pick = (def: PoiDef, report = true): Sector | null => {
        let pool: Sector[];
        if (def.point) {
            pool = candidates.filter(sector => sector.point === def.point);
        }
        else if (def.zone) {
            const zones = Array.isArray(def.zone) ? def.zone : [def.zone];
            pool = candidates.filter(sector => sector.zone != null && zones.includes(sector.zone));
        }
        else {
            console.warn(`POI_DEFS: ${def.type} names neither a zone nor a point; skipped`);
            return null;
        }
        pool = pool.filter(sector => !sector.heldBy && !usedKeys.has(`${sector.coord[0]},${sector.coord[1]}`));
        if (def.type === 'fieldEvent') {
            pool = pool.filter(sector => !getCoordsWithinHops(sector.coord, FIELD_EVENT_SPACING).some(([r, c]) => eventKeys.has(`${r},${c}`)));
        }
        if (pool.length === 0) {
            if (report) console.warn(`POI_DEFS: no free reachable tile for ${describe(def)}; skipped`);
            return null;
        }
        const sector = getRandomFromArray(pool);
        usedKeys.add(`${sector.coord[0]},${sector.coord[1]}`);
        if (def.type === 'fieldEvent') eventKeys.add(`${sector.coord[0]},${sector.coord[1]}`);
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
            // ground (the home ring, or an EXPLORE_EVERYTHING debug map) would otherwise stay hidden forever.
            // A concealed one is found by stepping on it, so it starts hidden regardless.
            status: sector.status === STATUSES.explored.key && !extras.concealed ? 'available' : 'hidden',
            distance: sector.graphDistanceHome, // cached for display/sorting (static once the map is generated)
            requires: null,
            difficultyKnown: false,
            reward: {},
            ...extras
        };
        return pois[id];
    };

    // A settlement additionally stamps its territory radius (flatland only; mountains and water are barriers already).
    // Placement requires clean ground out to radius+1, so stamps never overlap (retraction assumes one owner).
    const addSettlement = (def: PoiDef) => {
        for (let attempt = 0; attempt < 20; attempt++) {
            const sector = pick(def);
            if (!sector) return;
            const territoryRadius = def.territoryRadius ?? 0;
            const area = [sector.coord, ...getCoordsWithinHops(sector.coord, territoryRadius + 1)];
            const clean = area.every(([r, c]) => !map[r][c].heldBy && map[r][c].terrain !== TERRAINS.home.key);
            if (!clean) { // pick() already marked it used; try another tile
                if (attempt === 19) console.warn(`POI_DEFS: no clean ground for ${describe(def)}'s territory; skipped`);
                continue;
            }

            const poi = add('settlement', sector, { territoryRadius, levels: (def.levels || []).map(rollLevel),
                levelsShown: def.levelsShown, reloot: def.reloot, ...(def.site != null ? { site: def.site } : {}),
                ...(def.approachText ? { approachText: def.approachText } : {}) });
            if (def.discardedKg) poi.discardedKg = getRandomIntInclusive(def.discardedKg[0] / 10, def.discardedKg[1] / 10) * 10;
            const held: Sector[] = [];
            [sector.coord, ...getCoordsWithinHops(sector.coord, territoryRadius)].forEach(([r, c]) => {
                if (map[r][c].terrain === TERRAINS.flatland.key) {
                    map[r][c].heldBy = poi.id;
                    if (map[r][c] !== sector) held.push(map[r][c]);
                }
            });

            // Camps: one per declared level, each on a random tile of this site's own held ground (the only
            // POIs that live on held ground; pick() keeps everything else off it). A territory squeezed
            // small by mountains or coast simply fits fewer. Concealed, and the fight opens as an ambush
            // unless the camp names its own formation.
            (CAMPS_ENABLED ? def.camps || [] : []).forEach(campDef => {
                const free = held.filter(tile => beyondStartingVision(tile) && !usedKeys.has(`${tile.coord[0]},${tile.coord[1]}`));
                if (free.length === 0) return;
                const tile = getRandomFromArray(free);
                usedKeys.add(`${tile.coord[0]},${tile.coord[1]}`);
                add('camp', tile, { levels: [rollLevel({ formation: 'surround', ...campDef })], parentId: poi.id,
                    concealed: true });
            });
            return;
        }
    };

    // Tunnels: a POI on each mouth, both carrying the passage's fight and pointing at the other. Mouths stay
    // 'available' for good (the crossing is offered forever), so the map keeps showing them.
    const mouths: Record<string, Sector[]> = {};
    map.forEach(row => row.forEach(sector => {
        if (sector.tunnel) (mouths[sector.tunnel] = mouths[sector.tunnel] || []).push(sector);
    }));
    Object.entries(mouths).forEach(([digit, ends]) => {
        if (ends.length !== 2) {
            console.warn(`Authored map: tunnel ${digit} has ${ends.length} mouths, expected 2; skipped`);
            return;
        }
        const def = TUNNEL_DEFS[digit] || TUNNEL_DEFAULT;
        ends.forEach((sector, i) => {
            usedKeys.add(`${sector.coord[0]},${sector.coord[1]}`);
            // No levels = nobody inside: open from the start (a `requires` seal is the only barrier then)
            add('tunnel', sector, { tunnel: digit, exitCoord: ends[1 - i].coord, open: def.levels.length === 0,
                crossTiles: def.crossTiles, requires: def.requires || null,
                levels: def.levels.map(rollLevel), ...(def.name ? { name: def.name } : {}) });
        });
    });

    // The content manifest: each definition placed in its zone(s) `count` times, rewards rolled from their
    // declared ranges. A field event lands concealed (found by stepping on it): its answers roll their own
    // rewards, and the offer line's {loot} is the first answer's roll (the take-it one); an ambush's fight is a
    // level like any other site's.
    POI_DEFS.forEach(def => {
        const count = def.count ?? 1;
        for (let i = 0; i < count; i++) {
            if (def.type === 'settlement') {
                addSettlement(def);
                continue;
            }
            const sector = pick(def, false);
            if (!sector) {
                console.warn(`POI_DEFS: no free reachable tile for ${describe(def)}; ${i > 0 ? `placed ${i} of ${count}` : 'skipped'}`);
                break;
            }
            const extras: Partial<Poi> = {};
            if (def.name) extras.name = def.name;
            if (def.requires) extras.requires = def.requires;
            if (def.storyId) extras.storyId = def.storyId;
            if (def.promptText) extras.promptText = def.promptText;
            if (def.approachText) extras.approachText = def.approachText;
            if (def.actionLabel) extras.actionLabel = def.actionLabel;
            if (def.reward) extras.reward = rollPoiReward(def.reward);
            if (def.levels) extras.levels = def.levels.map(rollLevel);
            if (def.concealed ?? (def.type === 'fieldEvent')) extras.concealed = true;
            if (def.choices) {
                extras.choices = def.choices.map((choice: FieldEventChoiceDef): FieldEventChoice => ({
                    label: choice.label,
                    ...(choice.resultText ? { resultText: choice.resultText } : {}),
                    ...(choice.reward ? { reward: rollPoiReward(choice.reward) } : {}),
                    ...(choice.battery != null ? { battery: choice.battery } : {}),
                    ...(choice.units != null ? { units: choice.units } : {}),
                    ...(choice.revealNearest ? { revealNearest: true } : {})
                }));
                if (!def.reward) extras.reward = extras.choices[0].reward || {};
            }
            add(def.type, sector, extras);
        }
    });

    return pois;
}

function rollLevel(def: PoiLevelDef): PoiLevel {
    return { difficulty: def.difficulty, formation: def.formation, terrain: def.terrain,
        blurb: def.blurb, garrison: def.garrison, reward: def.reward ? rollPoiReward(def.reward) : {}, timesCleared: 0 };
}

// A settlement's fights, surface first; a camp's single one (empty for other POI types)
export function poiLevels(poi: Poi): PoiLevel[] {
    return poi.levels || [];
}

// POIs that are fought, not prompted: stepping onto one starts its battle. A tunnel is fought through
// once; open, it prompts the crossing instead. A field event is a fight only when it is an ambush.
export function isGarrisoned(poi: Poi): boolean {
    return poi.type === 'settlement' || poi.type === 'camp' || (poi.type === 'tunnel' && !poi.open) ||
        (poi.type === 'fieldEvent' && poiLevels(poi).length > 0);
}

// What winning a level pays on THIS clear: its rolled resources scaled by the site's reloot schedule (indexed by
// how often the level has fallen before; past the end it pays nothing). Salvage is first-clear only.
export function levelPayout(poi: Poi, levelIndex: number): PoiReward {
    const level = poiLevels(poi)[levelIndex];
    const schedule = poi.reloot || POI_TYPE_DEFAULTS[poi.type].reloot || [1];
    const fraction = schedule[level.timesCleared] ?? 0;
    const reward: PoiReward = {};
    if (level.reward.resources && fraction > 0) {
        reward.resources = mapObject(level.reward.resources, (resource, amount) => Math.floor(amount * fraction));
    }
    if (level.reward.capability && level.timesCleared === 0) reward.capability = level.reward.capability;
    return reward;
}

// Every tile a fully-tooled squad can reach from home: BFS over terrain crossable with all capabilities
// and through tunnels (the
// mouths sharing a digit count as adjacent: the drawing's islands are meant to be reached that way, so
// their zones take content now, ahead of the tunnel mechanics). Keys are "row,col".
function squadReachableSet(map: PlanetMap): Set<string> {
    const home = getHomeBasePosition(map).coord;
    const allTools: Capabilities = { drill: true, overrideModule: true, amphibious: true };

    const mouths: Record<string, Coord[]> = {};
    map.forEach(row => row.forEach(sector => {
        if (sector.tunnel) (mouths[sector.tunnel] = mouths[sector.tunnel] || []).push(sector.coord);
    }));

    const reachable = new Set([`${home[0]},${home[1]}`]);
    let frontier = [home];
    while (frontier.length > 0) {
        const next: Coord[] = [];
        frontier.forEach(coord => {
            const tunnel = map[coord[0]][coord[1]].tunnel;
            const neighbours = [...getAdjacentCoords(coord), ...(tunnel ? mouths[tunnel] : [])];
            neighbours.forEach(([r, c]) => {
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
 * in database/planet/poi_types.ts). Prompt texts are templates; {loot} expands to the POI's rolled reward.
 */

export function promptTextFor(poi: Poi): string {
    const template = poi.promptText || POI_TYPE_DEFAULTS[poi.type].promptText || '';
    const loot = poi.reward && poi.reward.resources ? ` — ${formatResourceList(poi.reward.resources)}` : '';
    return template.replace('{loot}', loot);
}

// The approach card's line for a garrisoned site
export function approachTextFor(poi: Poi): string {
    return poi.approachText || POI_TYPE_DEFAULTS[poi.type].approachText || '';
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


