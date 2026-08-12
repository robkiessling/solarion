import {getRandomFromArray} from "./helpers";
import {ACID_BAND_DISTANCES, getCrossTime, getHomeBasePosition, REGIONS, STATUSES, TERRAINS} from "./planet_map";
import {getAdjacentCoords, getCoordsWithinHops} from "./planet_geometry";
import {BANDS, GATE_DEFS, POI_DEFS, POI_TYPES, rollPoiReward, STORY_TEXTS} from "../database/pois";

/**
 * This module owns the point-of-interest (POI) domain logic: POI placement mechanics, encounter resolution
 * math, and report text. WHAT gets placed (counts, rewards, story text) is data in database/pois.js; squad
 * movement/driving lives in squad.js (the squad is player-driven).
 */

// POI content constants live in database/pois.js; re-exported here so consumers keep one import site.
export {POI_TYPES, STORY_TEXTS} from "../database/pois";

// The three tools. Stored in planet.unlockedTerrains (the shared capability set: terrain crossUpgrades and
// POI `requires` both read it), granted via upgrades or POI salvage (reward.capability).
export const CAPABILITY_LABELS = {
    drill: 'Plasma Drill',
    sealedChassis: 'Sealed Chassis',
    overrideModule: 'Override Module'
}

export const POI_STATUS = {
    hidden: 'hidden',       // tile not yet revealed by scouting
    available: 'available', // discovered, not yet resolved
    cleared: 'cleared'
}

export const FIGHT_DURATION_MS = 5000;
export const NEST_LOSS_FACTOR = 0.25; // fraction of a nest's difficulty lost as casualties on a win

// Display constants (colorKeys index into PLANET_COLORS in planet_render.js)
export const POI_GLYPHS = { cache: '$', nest: '@', storySite: '?', gate: '∩' };
export const POI_COLOR_KEYS = { cache: 'poiCache', nest: 'poiNest', storySite: 'poiStory', gate: 'poiGate' };
export const POI_LABELS = { cache: 'Supply Cache', nest: 'Hive Nest', storySite: 'Ruins', gate: 'Barrier' };
export const FIGHT_EFFECT_CHARS = ['×', '+', '*', '·'];

/**
 * The region/stamp placement pass: the POI_DEFS content manifest scattered per placement band, gate POIs on
 * the stamped gate tiles, and an infestation stamp around every nest (sector.infestedBy: scout-impassable,
 * not developable, squad-crossable; retracts when the nest is cleared). MUTATES the map (generation-time
 * only).
 */
export function generatePois(map) {
    const pois = {};
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
            if (sector.terrain === TERRAINS.flatland.enum && sector.graphDistanceHome > 2 &&
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
            status: sector.status === STATUSES.explored.enum ? POI_STATUS.available : POI_STATUS.hidden,
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
    const addNest = (band, difficulty, infestRadius) => {
        for (let attempt = 0; attempt < 20; attempt++) {
            const sector = pick(band);
            if (!sector) return;
            const area = [sector.coord, ...getCoordsWithinHops(sector.coord, infestRadius + 1)];
            const clean = area.every(([r, c]) => !map[r][c].infestedBy && !map[r][c].gated &&
                map[r][c].terrain !== TERRAINS.home.enum);
            if (!clean) continue; // pick() already marked it used; just try another tile

            const poi = add(POI_TYPES.nest, sector, { difficulty, infestRadius });
            [sector.coord, ...getCoordsWithinHops(sector.coord, infestRadius)].forEach(([r, c]) => {
                if (map[r][c].terrain === TERRAINS.flatland.enum && !map[r][c].gated) {
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
            addNest(def.band, def.difficulty, def.infestRadius);
            return;
        }
        const extras = {};
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
function squadReachableSet(map) {
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
export function formatResourceList(resources) {
    if (!resources) return '';
    return Object.entries(resources).map(([resource, amount]) => `${amount} ${resource}`).join(', ');
}

/**
 * Composes the display line for an expedition report. Reports are structured objects (built in planet.js);
 * the text is composed once here and stored on planet.fieldReports for the Expeditions panel feed.
 *
 * Resource rewards stored as cargo: carried by the team, delivered only when it reaches home (and lost on wipe).
 */
export function buildReportText(report) {
    const loaded = report.loaded && Object.keys(report.loaded).length > 0 ?
        ` Loaded ${formatResourceList(report.loaded)}.` : '';

    const salvaged = report.capability ? ` Salvaged: ${CAPABILITY_LABELS[report.capability] || report.capability}.` : '';

    switch (report.result) {
        case 'success':
            if (report.poiType === POI_TYPES.nest) {
                const reclaimed = report.landCredit > 0 ? ` Reclaimed ${report.landCredit} land.` : '';
                return `Cleared ${report.poiName} — lost ${report.losses} of ${report.squadSize} droids.${reclaimed}${loaded}`;
            }
            if (report.poiType === POI_TYPES.storySite) {
                const story = STORY_TEXTS[report.storyId] || 'Site explored.';
                return `${report.poiName} explored: "${story}"${salvaged}${loaded}`;
            }
            if (report.poiType === POI_TYPES.gate) {
                return `${report.poiName} opened. The way is clear.`;
            }
            return `Recovered ${report.poiName}.${salvaged}${loaded}`;
        case 'failure': {
            const cargoLost = report.cargoLost && Object.keys(report.cargoLost).length > 0 ?
                ` Cargo lost: ${formatResourceList(report.cargoLost)}.` : '';
            return `Team lost assaulting ${report.poiName}. Hostile strength confirmed: ${report.difficulty}.${cargoLost}`;
        }
        case 'returned': {
            const delivered = report.cargo && Object.keys(report.cargo).length > 0 ?
                ` Delivered ${formatResourceList(report.cargo)}.` : '';
            return `Team returned to base (${report.survivors} droids).${delivered}`;
        }
        case 'delivered':
            return `Cargo banked: ${formatResourceList(report.cargo)}.`;
        case 'blocked':
            return `${report.poiName} is sealed — requires ${CAPABILITY_LABELS[report.requires] || report.requires}.`;
        case 'noRoute':
            return `No route to ${report.poiName}.`;
        default:
            return '';
    }
}

// Difficulty shown as a band until a squad has made contact (first fight reveals the exact number).
export function estimateDifficultyRange(difficulty) {
    const lo = Math.floor((difficulty - 1) / 3) * 3 + 1;
    return [lo, lo + 2];
}

// The deterministic encounter resolution. Nests: strength check. Everything else always succeeds.
export function computeOutcome(poi, squadSize) {
    if (poi.type === POI_TYPES.nest) {
        const success = squadSize >= poi.difficulty;
        const losses = success ? Math.min(squadSize, Math.ceil(poi.difficulty * NEST_LOSS_FACTOR)) : squadSize;
        return { success, losses, survivors: squadSize - losses };
    }
    return { success: true, losses: 0, survivors: squadSize };
}

