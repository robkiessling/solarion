import {getRandomFromArray, getRandomIntInclusive} from "./helpers";
import {TERRAINS} from "./planet_map";

/**
 * This module owns the point-of-interest (POI) domain logic: POI generation, encounter resolution math, and
 * report text. Squad movement/driving lives in squad.js (the squad is player-driven; see Addendum 2.1).
 */

export const POI_TYPES = {
    cache: 'cache',
    nest: 'nest',
    storySite: 'storySite'
}

export const POI_STATUS = {
    hidden: 'hidden',       // tile not yet revealed by scouting
    available: 'available', // discovered, not yet resolved
    cleared: 'cleared'
}

export const FIGHT_DURATION_MS = 5000;
export const NEST_LOSS_FACTOR = 0.25; // fraction of a nest's difficulty lost as casualties on a win

// Display constants (colorKeys index into PLANET_COLORS in planet_render.js)
export const POI_GLYPHS = { cache: '$', nest: '@', storySite: '?' };
export const POI_COLOR_KEYS = { cache: 'poiCache', nest: 'poiNest', storySite: 'poiStory' };
export const POI_LABELS = { cache: 'Supply Cache', nest: 'Hive Nest', storySite: 'Ruins' };
export const FIGHT_EFFECT_CHARS = ['×', '+', '*', '·'];

// Story text lives here (not in the log database) because reports are dynamic; reports store the key only.
export const STORY_TEXTS = {
    debugRuins1: 'A droid chassis, half-buried. The model number matches your own manufacturing line. You did not build it.',
    debugRuins2: 'A collapsed structure of familiar design. Its data core is scorched from the inside.'
}

/**
 * Sprinkles placeholder POIs across the generated map so the expedition loop is testable. Will be replaced by the
 * real region/stamp placement pass. Selection: flatland tiles bucketed by cached graphDistanceHome.
 */
export function generateDebugPois(map) {
    // Candidate tiles by coord key, so picks are unique
    const candidates = [];
    map.forEach(row => {
        row.forEach(sector => {
            if (sector.terrain === TERRAINS.flatland.enum && sector.graphDistanceHome > 0) {
                candidates.push(sector);
            }
        });
    });

    const pois = {};
    const usedKeys = new Set();

    const pick = (minDist, maxDist) => {
        const pool = candidates.filter(s =>
            s.graphDistanceHome >= minDist && s.graphDistanceHome <= maxDist &&
            !usedKeys.has(`${s.coord[0]},${s.coord[1]}`)
        );
        if (pool.length === 0) return null;
        const sector = getRandomFromArray(pool);
        usedKeys.add(`${sector.coord[0]},${sector.coord[1]}`);
        return sector;
    };

    const add = (type, sector, extras = {}) => {
        if (!sector) return; // band had no candidates on this map roll; acceptable for debug placement
        const id = `poi_${sector.coord[0]}_${sector.coord[1]}`;
        pois[id] = {
            id,
            coord: sector.coord,
            type,
            name: POI_LABELS[type],
            status: POI_STATUS.hidden,
            distance: sector.graphDistanceHome, // cached for display/sorting (static once the map is generated)
            requires: null,
            difficulty: null,
            difficultyKnown: false,
            reward: {},
            ...extras
        };
    };

    const nestDifficulty = (sector) => 2 + Math.floor(sector.graphDistanceHome / 2);

    for (let i = 0; i < 3; i++) {
        const sector = pick(2, 6);
        add(POI_TYPES.cache, sector, { reward: { resources: { ore: getRandomIntInclusive(3, 10) * 100 } } });
    }
    for (let i = 0; i < 3; i++) {
        const sector = pick(4, 12);
        if (sector) add(POI_TYPES.nest, sector, { difficulty: nestDifficulty(sector) });
    }
    // One gated nest to exercise the requires UI. Note: no upgrade currently populates unlockedTerrains, so this
    // one stays blocked until the capability content lands.
    {
        const sector = pick(6, 10);
        if (sector) add(POI_TYPES.nest, sector, { difficulty: nestDifficulty(sector), requires: 'mountaineering' });
    }
    add(POI_TYPES.storySite, pick(5, 9), { storyId: 'debugRuins1', reward: { resources: { ore: 400 } } });
    add(POI_TYPES.storySite, pick(9, 14), { storyId: 'debugRuins2', reward: { resources: { ore: 800 } } });

    return pois;
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

    switch (report.result) {
        case 'success':
            if (report.poiType === POI_TYPES.nest) {
                return `Cleared ${report.poiName} — lost ${report.losses} of ${report.squadSize} droids.${loaded}`;
            }
            if (report.poiType === POI_TYPES.storySite) {
                const story = STORY_TEXTS[report.storyId] || 'Site explored.';
                return `${report.poiName} explored: "${story}"${loaded}`;
            }
            return `Recovered ${report.poiName}.${loaded}`;
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
            return `${report.poiName} is sealed — requires ${report.requires}.`;
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

