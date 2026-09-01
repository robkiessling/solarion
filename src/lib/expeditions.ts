import {getRandomFromArray} from "./helpers";
import {ACID_BAND_DISTANCES, getCrossTime, getHomeBasePosition, REGIONS, STATUSES, TERRAINS} from "./planet_map";
import {getAdjacentCoords, getCoordsWithinHops} from "./planet_geometry";
import {BANDS, GATE_DEFS, POI_DEFS, POI_LABELS, POI_TYPE_DEFAULTS, POI_TYPES, rollPoiReward} from "../database/pois";

/**
 * This module owns the point-of-interest (POI) domain logic: POI placement mechanics, encounter resolution
 * math, and report text. WHAT gets placed (counts, rewards, story text) is data in database/pois.js; squad
 * movement/driving lives in squad.js (the squad is player-driven).
 */

// POI content records (types, texts, labels, glyphs) live in database/pois.js; re-exported here so
// consumers keep one import site.
export {CAPABILITY_LABELS, FIGHT_EFFECT_CHARS, POI_COLOR_KEYS, POI_GLYPHS, POI_LABELS, POI_TYPES,
    STORY_TEXTS} from "../database/pois";

export const POI_STATUS: Record<PoiStatus, PoiStatus> = {
    hidden: 'hidden',       // tile not yet revealed by scouting
    available: 'available', // discovered, not yet resolved
    cleared: 'cleared'
}

/**
 * The region/stamp placement pass: the POI_DEFS content manifest scattered per placement band, gate POIs on
 * the stamped gate tiles, and an infestation stamp around every nest (sector.infestedBy: scout-impassable,
 * not developable, squad-crossable; retracts when the nest is cleared). MUTATES the map (generation-time
 * only).
 */
export function generatePois(map: PlanetMap): Record<string, Poi> {
    const pois: Record<string, Poi> = {};
    const usedKeys = new Set();

    const bandOf = (sector) => {
        if (sector.region === REGIONS.bowl) return BANDS.r1;
        if (sector.region === REGIONS.antipode) return BANDS.r3;
        return sector.graphDistanceHome < ACID_BAND_DISTANCES[0] ? BANDS.r2near : BANDS.r2far;
    };

    // Only place POIs where a fully-tooled squad can actually walk (gates treated as open, acid as
    // crossable). Scenery mountain ranges leave pockets, and a capability salvage inside one would make the
    // seed unfinishable; the map-gen corridor carve guarantees each region has reachable ground.
    const reachable = squadReachableSet(map);

    const candidates = [];
    map.forEach(row => {
        row.forEach(sector => {
            if (sector.terrain === TERRAINS.flatland.key && sector.graphDistanceHome > 2 &&
                !sector.gated && reachable.has(`${sector.coord[0]},${sector.coord[1]}`)) {
                candidates.push(sector);
            }
        });
    });

    const pick = (band) => {
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

    const add = (type, sector, extras = {}) => {
        if (!sector) return null;
        const id = `poi_${sector.coord[0]}_${sector.coord[1]}`;
        pois[id] = {
            id,
            coord: sector.coord,
            type,
            name: POI_LABELS[type],
            // Discovery normally happens when scouting reveals the tile; a POI born on already-explored
            // ground (the home ring, or an EXPLORE_EVERYTHING debug map) would otherwise stay hidden forever
            status: sector.status === STATUSES.explored.key ? POI_STATUS.available : POI_STATUS.hidden,
            distance: sector.graphDistanceHome, // cached for display/sorting (static once the map is generated)
            requires: null,
            difficulty: null,
            difficultyKnown: false,
            reward: {},
            ...extras
        };
        return pois[id];
    };

    // A nest additionally stamps its infestation radius (flatland only; mountains/acid are barriers already).
    // Placement requires clean ground out to radius+1, so stamps never overlap (retraction assumes one owner).
    const addNest = (def) => {
        for (let attempt = 0; attempt < 20; attempt++) {
            const sector = pick(def.band);
            if (!sector) return;
            const area = [sector.coord, ...getCoordsWithinHops(sector.coord, def.infestRadius + 1)];
            const clean = area.every(([r, c]) => !map[r][c].infestedBy && !map[r][c].gated &&
                map[r][c].terrain !== TERRAINS.home.key);
            if (!clean) continue; // pick() already marked it used; just try another tile

            const poi = add(POI_TYPES.nest, sector, { difficulty: def.difficulty, infestRadius: def.infestRadius,
                formation: def.formation, bugs: def.bugs, terrain: def.terrain, blurb: def.blurb });
            [sector.coord, ...getCoordsWithinHops(sector.coord, def.infestRadius)].forEach(([r, c]) => {
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
            if (!sector.gated) return;
            usedKeys.add(`${sector.coord[0]},${sector.coord[1]}`);
            add(POI_TYPES.gate, sector, { ...GATE_DEFS[sector.gateKind] });
        });
    });

    // The content manifest: each definition placed in its band, rewards rolled from their declared ranges
    POI_DEFS.forEach(def => {
        if (def.type === POI_TYPES.nest) {
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
        add(def.type, pick(def.band), extras);
    });

    return pois;
}

// Every tile a fully-tooled squad can reach from home: BFS over terrain crossable with all capabilities,
// through gate tiles (they're flatland; the gate POI is the openable barrier). Keys are "row,col".
function squadReachableSet(map: PlanetMap): Set<string> {
    const home = getHomeBasePosition(map).coord;
    const allTools = { drill: true, sealedChassis: true, overrideModule: true };

    const reachable = new Set([`${home[0]},${home[1]}`]);
    let frontier = [home];
    while (frontier.length > 0) {
        const next = [];
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
    return Object.entries(resources).map(([resource, amount]) => `${amount} ${resource}`).join(', ');
}

/**
 * Encounter popup content accessors: definition field if present, else the type default (POI_TYPE_DEFAULTS
 * in database/pois.js). Prompt texts are templates; {loot} expands to the POI's rolled reward.
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
export function resultBehaviorFor(poi: Poi): 'auto' | 'narrate' {
    return poi.resultBehavior || POI_TYPE_DEFAULTS[poi.type].result;
}

// Difficulty shown as a band until a squad has made contact (first fight reveals the exact number).
export function estimateDifficultyRange(difficulty: number): [number, number] {
    const lo = Math.floor((difficulty - 1) / 3) * 3 + 1;
    return [lo, lo + 2];
}


