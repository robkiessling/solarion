import {getRandomFromArray, getRandomIntInclusive, mapObject} from "../helpers";
import {getCrossTime, getHomeBasePosition, type PlanetMap, type Sector} from "./map";
import {getAdjacentCoords, getCoordsWithinHops} from "./geometry";
import {STATUSES, TERRAINS, VISION_HOPS} from "../../database/planet/terrain";
import {LOOT_LABELS, POI_LABELS, POI_TYPE_DEFAULTS, type FightDef, type GroundDef, type PoiChoiceDef, type PoiReward, type PoiStatus, type PoiType, type RewardDef, type Rollable, type SealDef, type SettlementDef, type TunnelDef} from "../../database/planet/poi_types";
import {CAMPS_ENABLED, FIELD_EVENT_SPACING, POI_DEFS} from "../../database/planet/pois";
import type {Capabilities} from "../../database/planet/capabilities";
import type {EquipmentCharges, EquipmentId} from "../../database/squad/equipment";
import type {HostileType} from "../../database/battle/units";
import type {HostileFormation, TerrainLayoutId} from "../battle/layouts";

/** One placed fight (see FightDef in database/planet/poi_types.ts), hostile counts and rewards rolled. `timesCleared`
 * counts wins on this level across assaults: it indexes the site's reloot schedule. */
export interface PoiFight {
    hostiles: Partial<Record<HostileType, number>>;
    formation?: HostileFormation;
    terrain?: TerrainLayoutId;
    blurb?: string;
    reward: PoiReward;
    timesCleared: number;
}

/** One answer on a prompted POI's popup, rewards rolled (see PoiChoiceDef in database/planet/poi_types.ts) */
export interface PoiChoice {
    label: string;
    resultText?: string;
    reward?: PoiReward;
    battery?: number;
    units?: number;
    revealNearest?: boolean;
    equipment?: EquipmentId;
}

/** A placed seal (see SealDef): the site raises this prompt until one of its answers has cleared it */
export interface PoiSeal {
    promptText: string;
    choices: PoiChoice[];
}

/** A placed POI in planet.pois */
export interface Poi {
    id: string;
    coord: Coord;
    type: PoiType;
    name: string;
    status: PoiStatus;
    distance: number;
    /** the blocker in front of the site; gone once cleared (a tunnel's goes from both mouths at once) */
    seal?: PoiSeal;
    /** a fight here has shown the true signature count (the approach card shows a band until then) */
    signaturesKnown: boolean;
    reward: PoiReward;
    territoryRadius?: number;
    promptText?: string;
    approachText?: string;
    /** settlements: the site's fights, surface first (one or more) */
    levels?: PoiFight[];
    levelsShown?: boolean;
    reloot?: number[];
    discardedKg?: number;
    /** settlements on a pre-war network facility: its number (see PoiDef.site) */
    site?: number;
    /** camps: the settlement whose held ground this sits on */
    parentId?: string;
    /** stays hidden when its tile is scouted; found by stepping on it (camps, field events, ambushes) */
    concealed?: boolean;
    /** the popup's answers, if authored (see poiChoices); an ambush has `levels` instead */
    choices?: PoiChoice[];
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
 * list) or on its point (one exact tile) painted in the authored map, `count` times; a tunnel entry on the two
 * mouths painted with its digit; and a territory stamp around every settlement (sector.heldBy: scout-impassable, not
 * developable, squad-crossable; retracts when the settlement is cleared). Tunnels go first, then settlements, whatever
 * the manifest's order, since a stamp must not swallow a tile something else already took; the rest follow in
 * manifest order, and field events and ambushes keep FIELD_EVENT_SPACING hops from each other. An entry that cannot be
 * placed (in full) is reported on the console rather than dropped silently: the manifest is the content plan,
 * and a missing entry is a bug in the drawing or the manifest.
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

    const describe = (def: GroundDef) => `${def.name || def.type}${def.point ? ` at point ${def.point}` :
        ` in zone ${Array.isArray(def.zone) ? def.zone.join('/') : def.zone}`}${(def.count ?? 1) > 1 ? ` (x${def.count})` : ''}`;

    // A random free tile of the def's zone(s), or its point's tile. Territory never overlaps a placed POI
    // (a settlement rolled inside another's stamp would share ground; a cache under one would be unreachable
    // to scouts), so held tiles are out of the pool. Field events and ambushes also keep their spacing from each other.
    const eventKeys = new Set<string>();
    const spaced = (def: GroundDef) => def.type === 'fieldEvent' || def.type === 'ambush';
    const rejected = new Set<string>(); // settlement picks turned down for their territory: not offered again, not obstacles
    const pick = (def: GroundDef, report = true): Sector | null => {
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
        pool = pool.filter(sector => !sector.heldBy && !usedKeys.has(`${sector.coord[0]},${sector.coord[1]}`) && !rejected.has(`${sector.coord[0]},${sector.coord[1]}`));
        if (spaced(def)) {
            pool = pool.filter(sector => !getCoordsWithinHops(sector.coord, FIELD_EVENT_SPACING).some(([r, c]) => eventKeys.has(`${r},${c}`)));
        }
        if (pool.length === 0) {
            if (report) console.warn(`POI_DEFS: no free reachable tile for ${describe(def)}; skipped`);
            return null;
        }
        const sector = getRandomFromArray(pool);
        usedKeys.add(`${sector.coord[0]},${sector.coord[1]}`);
        if (spaced(def)) eventKeys.add(`${sector.coord[0]},${sector.coord[1]}`);
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
            signaturesKnown: false,
            reward: {},
            ...extras
        };
        return pois[id];
    };

    // A settlement additionally stamps its territory radius (flatland only; mountains and water are barriers already).
    // Placement requires clean ground out to radius+1 (nothing held, nothing already placed such as a tunnel
    // mouth, not home), so stamps never overlap (retraction assumes one owner) and never swallow a POI.
    const addSettlement = (def: SettlementDef) => {
        for (let attempt = 0; attempt < 20; attempt++) {
            const sector = pick(def);
            if (!sector) return;
            const territoryRadius = def.territoryRadius;
            const area = getCoordsWithinHops(sector.coord, territoryRadius + 1);
            const clean = area.every(([r, c]) => !map[r][c].heldBy && !usedKeys.has(`${r},${c}`) && map[r][c].terrain !== TERRAINS.home.key);
            if (!clean) { // give the tile back (it is not a POI) and try another
                usedKeys.delete(`${sector.coord[0]},${sector.coord[1]}`);
                rejected.add(`${sector.coord[0]},${sector.coord[1]}`);
                if (attempt === 19) console.warn(`POI_DEFS: no clean ground for ${describe(def)}'s territory; skipped`);
                continue;
            }

            const poi = add('settlement', sector, { territoryRadius, levels: def.levels.map(rollFight), approachText: def.approachText,
                levelsShown: def.levelsShown, reloot: def.reloot, ...(def.site != null ? { site: def.site } : {}),
                ...(def.name ? { name: def.name } : {}), ...(def.seal ? { seal: rollSeal(def.seal) } : {}) });
            if (def.discardedKg) poi.discardedKg = getRandomIntInclusive(def.discardedKg[0] / 10, def.discardedKg[1] / 10) * 10;
            const held: Sector[] = [];
            [sector.coord, ...getCoordsWithinHops(sector.coord, territoryRadius)].forEach(([r, c]) => {
                if (map[r][c].terrain === TERRAINS.flatland.key) {
                    map[r][c].heldBy = poi.id;
                    if (map[r][c] !== sector) held.push(map[r][c]);
                }
            });

            // Camps: one per declared entry, each on a random tile of this site's own held ground (the only
            // POIs that live on held ground; pick() keeps everything else off it). A territory squeezed
            // small by mountains or coast simply fits fewer. Concealed, and the fight opens as an ambush
            // unless the camp names its own formation. Its approach line is its own or the site's shared one.
            (CAMPS_ENABLED ? def.camps || [] : []).forEach(campDef => {
                const free = held.filter(tile => beyondStartingVision(tile) && !usedKeys.has(`${tile.coord[0]},${tile.coord[1]}`));
                if (free.length === 0) return;
                const tile = getRandomFromArray(free);
                usedKeys.add(`${tile.coord[0]},${tile.coord[1]}`);
                const { approachText, ...level } = campDef;
                add('camp', tile, { levels: [rollFight({ formation: 'surround', ...level })], parentId: poi.id,
                    concealed: true, approachText: approachText || def.campApproachText });
            });
            return;
        }
    };

    // Tunnels first: a POI on each mouth painted with the entry's digit, both carrying the passage's fight and pointing
    // at the other, so settlement territory stays off the mouths. Mouths stay 'available' for good (the crossing is
    // offered forever), so the map keeps showing them. A digit with no entry is plain ground, reported.
    const mouths: Record<string, Sector[]> = {};
    map.forEach(row => row.forEach(sector => {
        if (sector.tunnel) (mouths[sector.tunnel] = mouths[sector.tunnel] || []).push(sector);
    }));
    const addTunnel = (def: TunnelDef) => {
        const ends = mouths[def.digit] || [];
        if (ends.length !== 2) {
            console.warn(`POI_DEFS: tunnel ${def.digit} has ${ends.length} painted mouths, expected 2; skipped`);
            return;
        }
        delete mouths[def.digit];
        ends.forEach((sector, i) => {
            usedKeys.add(`${sector.coord[0]},${sector.coord[1]}`);
            // No levels = nobody inside: open from the start (a seal is the only barrier then)
            add('tunnel', sector, { tunnel: def.digit, exitCoord: ends[1 - i].coord, open: def.levels.length === 0, approachText: def.approachText,
                crossTiles: def.crossTiles, ...(def.seal ? { seal: rollSeal(def.seal) } : {}),
                levels: def.levels.map(rollFight), ...(def.name ? { name: def.name } : {}) });
        });
    };

    // Answers as placed: rewards rolled. A prompted POI's own reward, when its definition has none, is its first
    // answer's roll (the take-it one), which is also what the offer line's {loot} shows.
    const rollChoices = (defs: PoiChoiceDef[]): PoiChoice[] => defs.map(choice => ({
        label: choice.label,
        ...(choice.resultText ? { resultText: choice.resultText } : {}),
        ...(choice.reward ? { reward: rollReward(choice.reward) } : {}),
        ...(choice.battery != null ? { battery: choice.battery } : {}),
        ...(choice.units != null ? { units: choice.units } : {}),
        ...(choice.revealNearest ? { revealNearest: true } : {}),
        ...(choice.equipment ? { equipment: choice.equipment } : {})
    }));
    const rollSeal = (def: SealDef): PoiSeal => ({ promptText: def.promptText, choices: rollChoices(def.choices) });
    const placeOne = (def: Exclude<GroundDef, SettlementDef>, sector: Sector) => {
        const base: Partial<Poi> = { ...(def.name ? { name: def.name } : {}), ...(def.seal ? { seal: rollSeal(def.seal) } : {}) };
        switch (def.type) {
            case 'cache':
                add('cache', sector, { ...base, promptText: def.promptText, reward: rollReward(def.reward) });
                break;
            case 'storySite': {
                const choices = rollChoices(def.choices);
                add('storySite', sector, { ...base, promptText: def.promptText, choices, reward: choices[0].reward || {} });
                break;
            }
            case 'fieldEvent': { // found by stepping on it
                const choices = rollChoices(def.choices);
                add('fieldEvent', sector, { ...base, promptText: def.promptText, choices, reward: choices[0].reward || {}, concealed: true });
                break;
            }
            case 'ambush': // found by stepping on it, and sprung: encircled unless it names a formation. The def carries
                // its one fight's fields flat
                add('ambush', sector, { ...base, approachText: def.approachText, levels: [rollFight({ formation: 'surround', ...def })], concealed: true });
                break;
        }
    };

    // The content manifest: tunnels on their mouths, then each ground definition placed in its zone(s) `count` times,
    // settlements first (see above), then everything else in manifest order.
    POI_DEFS.forEach(def => { if (def.type === 'tunnel') addTunnel(def); });
    Object.keys(mouths).forEach(digit => console.warn(`Authored map: tunnel digit ${digit} has no POI_DEFS entry; its mouths are plain ground`));
    POI_DEFS.forEach(def => {
        if (def.type !== 'settlement') return;
        for (let i = 0; i < (def.count ?? 1); i++) addSettlement(def);
    });
    POI_DEFS.forEach(def => {
        if (def.type === 'settlement' || def.type === 'tunnel') return;
        const count = def.count ?? 1;
        for (let i = 0; i < count; i++) {
            const sector = pick(def, false);
            if (!sector) {
                console.warn(`POI_DEFS: no free reachable tile for ${describe(def)}; ${i > 0 ? `placed ${i} of ${count}` : 'skipped'}`);
                break;
            }
            placeOne(def, sector);
        }
    });

    return pois;
}

// One authored number as placed: fixed, or a [lo, hi] range rolled once here. `step` rounds the roll to a grid
// (resource amounts roll in steps of 100, so [500, 1000] lands on 500, 600, ... 1000).
export function rollRange(value: Rollable, step = 1): number {
    return Array.isArray(value) ? getRandomIntInclusive(value[0] / step, value[1] / step) * step : value;
}

// A reward as placed: resource amounts rolled in steps of 100; a capability passes through unchanged
function rollReward(def: RewardDef): PoiReward {
    const { resources, ...rest } = def;
    const reward: PoiReward = { ...rest };
    if (resources) reward.resources = mapObject(resources, (resource, amount) => rollRange(amount, 100));
    return reward;
}

// Rolls one fight's hostile counts and reward. Takes any def carrying a fight's fields (an ambush def has them flat
// beside its placement fields) and copies only the fight's own.
function rollFight(def: FightDef): PoiFight {
    return { hostiles: mapObject(def.hostiles, (type, count) => rollRange(count)), formation: def.formation, terrain: def.terrain,
        blurb: def.blurb, reward: def.reward ? rollReward(def.reward) : {}, timesCleared: 0 };
}

// The signature count a scan of a fight reports: every hostile fielded, whatever its type
export function fightSignatures(level: PoiFight): number {
    return Object.values(level.hostiles).reduce((n, count) => n + (count || 0), 0);
}

// A settlement's fights, surface first; a camp's single one (empty for other POI types)
export function poiLevels(poi: Poi): PoiFight[] {
    return poi.levels || [];
}

// POIs that are fought, not prompted: stepping onto one starts its battle. A tunnel is fought through
// once; open, it prompts the crossing instead.
export function isGarrisoned(poi: Poi): boolean {
    return poi.type === 'settlement' || poi.type === 'camp' || poi.type === 'ambush' || (poi.type === 'tunnel' && !poi.open);
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
    const allTools: Capabilities = { overrideModule: true, amphibious: true };

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
 * Encounter popup content accessors. Every line is authored per site (a camp's approach line is its own or its
 * settlement's); {loot} in an offer line expands to the POI's rolled reward.
 */

export function promptTextFor(poi: Poi): string {
    const template = poi.promptText || '';
    const loot = poi.reward && poi.reward.resources ? ` — ${formatResourceList(poi.reward.resources)}` : '';
    return template.replace('{loot}', loot);
}

// The approach card's line for a garrisoned site
export function approachTextFor(poi: Poi): string {
    return poi.approachText || '';
}

// The answers a squad can take from a list: one that spends equipment is not listed unless the squad holds a charge
// of it right now (the gear is never named as a requirement; carrying it is how the player learns what it opens).
// Every reader of a choice list goes through here, so the buttons, the number keys and the thunk that resolves an
// index all agree on which answer is which.
function offeredChoices(choices: PoiChoice[], equipment: EquipmentCharges): PoiChoice[] {
    return choices.filter(choice => !choice.equipment || (equipment[choice.equipment] || 0) > 0);
}

// The popup's answers: the authored list, or the one take-it answer a POI without choices gets (the type's
// label, paying the POI's own reward, closing the popup since it has no narration)
export function poiChoices(poi: Poi, equipment: EquipmentCharges): PoiChoice[] {
    return offeredChoices(poi.choices || [{ label: POI_TYPE_DEFAULTS[poi.type].actionLabel || 'Take' }], equipment);
}

// A sealed site's answers: the ways through the blocker the squad can afford right now
export function sealChoices(poi: Poi, equipment: EquipmentCharges): PoiChoice[] {
    return poi.seal ? offeredChoices(poi.seal.choices, equipment) : [];
}

// The signature count shown as a band until a squad has made contact (first fight reveals the exact number). The band is
// a cell of a fixed grid, not a spread around the true value (a centered spread would give the number away as
// its midpoint), and the grid coarsens with magnitude so the fuzz stays about a third wide from a handful of
// defenders to thousands: the step is the largest rung of the ladder at or under a third of the value.
// 6 -> 4 to 6, 45 -> 41 to 50, 1500 -> 1001 to 1500.
const ESTIMATE_STEPS = [3, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
export function estimateSignatureRange(signatures: number): [number, number] {
    let step = ESTIMATE_STEPS[0];
    ESTIMATE_STEPS.forEach(rung => { if (rung <= signatures / 3) step = rung; });
    const lo = Math.floor((signatures - 1) / step) * step + 1;
    return [lo, lo + step - 1];
}


