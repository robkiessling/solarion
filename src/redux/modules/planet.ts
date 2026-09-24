import update from 'immutability-helper';
import {getBatteryCapacity, getDroidStats, getReplicationMultiplier, ownedEquipment, recalculateState, surveyAutomationUnlocked, withRecalculation} from "../reducer";
import {generatePlanetMap, getCrossTime, getCurrentDevelopmentArea, getGridHalo, getHomeBasePosition, getNextDevelopmentArea, getVisibleCoords, isPassable, NUM_SECTORS, numSectorsMatching, type PlanetMap, type Unlocks} from "../../lib/planet/map";
import {centeringRotation, COOK_TIME, sunTrackingRotation} from "../../lib/planet/image";
import {SCOUT_VISION_HOPS, STATUSES, SURVEY_HALO_RADIUS, TERRAINS, TERRAIN_BLURBS, TERRAIN_BLURB_REPEAT_MS, type SquadZone} from "../../database/planet/terrain";
import {getApproxDistance, getCoordsWithinHops, parseCoordKey} from "../../lib/planet/geometry";
import {typedEntries} from "../../lib/helpers";
import {
    findNearestLookout,
    findNearestLookoutFromGrid,
    findPathToGrid,
    isExplorationComplete
} from "../../lib/planet/pathing";
import {formatResourceList, generatePois, isGarrisoned, levelPayout, poiLevels, resultBehaviorFor, type Poi} from "../../lib/planet/pois";
import {applyEquipment, createBattle, fullDroidHp, startWithdrawal, type Battle} from "../../lib/battle";
import {advanceSquad, createSquad, droidsRecovered, isOnGrid, restoredOnGrid, squadBatteryCapacity, squadDrainPerTile, type Squad, type SquadEvent} from "../../lib/planet/squad";
import {logInline} from "./log";
import {EXPLORE_EVERYTHING} from "../../dev/skips";
import {zoneColor} from "../../database/planet/colors";
import {CONTACT_MS} from "../../database/squad/tuning";
import {CAPABILITY_LABELS, type Capability, type PoiReward} from "../../database/planet/poi_types";
import type {StoryId} from "../../database/planet/story_sites";
import {TELEMETRY, unitNoun} from "../../database/planet/telemetry";
import {DROID_BASE_STATS, type DroidStats} from "../../database/battle/units";
import type {EquipmentCharges, EquipmentId} from "../../database/squad/equipment";
import type {DroidAssignment} from "../../database/base/structures";
import {batch} from "react-redux";
import * as fromClock from "./clock";

/** A scout droid (planet.droids) */
export interface ScoutDroid {
    coord: Coord | null;
    path: Coord[];
    target: Coord | null;
    moveProgress: number;
    /** [dRow, dCol] the scout last walked toward; equidistant lookouts are picked along it */
    heading: [number, number] | null;
    docked?: boolean;
    docking?: boolean;
    returning?: boolean;
}

/**
 * What the encounter popup narrates in its result phase. Fight outcomes carry the roster numbers and the final
 * battle frame; site outcomes (caches, story sites) carry what was found. Display strings are composed at
 * render time so the stored shape stays serializable.
 */
export interface EncounterResult {
    wiped?: boolean;
    losses?: number;
    squadSize?: number;
    multiplier?: number;
    landCredit?: number;
    cargoLost?: ResourceAmounts | null;
    finalBattle?: Battle;
    storyId?: StoryId | null;
    capability?: Capability | null;
    loaded?: ResourceAmounts | null;
    /** field event answers: battery gained or spent, units added to the roster */
    battery?: number;
    unitsGained?: number;
    /** fights in a multi-level settlement: the level just won (0 = surface), and the site's level count when it is known
     * (announced up front, or learned by reaching the bottom) */
    level?: number;
    levelsTotal?: number | null;
    /** set while the site has more beneath: the result phase becomes the descend-or-withdraw choice */
    nextLevel?: number;
}

export interface EncounterPrompt {
    poiId: string;
    /** offer: a site's take-it choice; approach: a garrisoned site's card before the fight; result: what happened */
    phase: 'offer' | 'approach' | 'result';
    result?: EncounterResult | null;
    /** approach, and between a settlement's levels: the tile the squad entered from, where leaving walks back to */
    fromCoord?: Coord;
    /** approach on a concealed site: elapsed game time it was sprung; the card holds for the contact beat while
     * the map plays the squad's glyph blinking on the tile */
    sprungAt?: number;
}

/** planet.overallStatus: the state of scout exploration of the map */
export type MapStatus = 'unstarted' | 'inProgress' | 'finished';

/** Who drives the planet rotation */
export type RotationMode =
    | 'manual'  // the longitude slider
    | 'sun'     // the camera locks to the day side
    | 'squad';  // the camera follows the expedition team (or centers home base when no team is deployed)

export interface PlanetState {
    map: PlanetMap;
    homeCoord: Coord | null;
    overallStatus: MapStatus;
    rotation: number;
    rotationMode: RotationMode;
    droidData: DroidAssignment;
    squadDroidData: DroidAssignment;
    droids: ScoutDroid[];
    unlockedTerrains: Unlocks;
    haloRadius: number;
    beaconCoord: Coord | null;
    exploreSpeed: number;
    cookedPct: number;
    numExplored: number;
    maxDevelopedLand: number;
    pois: { [poiId: string]: Poi };
    squad: Squad | null;
    prompt: EncounterPrompt | null;
    battlesFought: number;
    squadsReturned: number;
}

// Terrain notes: elapsed game time each zone was last noted (session-only; not worth persisting)
const lastBlurbAt: Partial<Record<SquadZone, number>> = {};

// Actions
export const GENERATE_MAP = 'planet/GENERATE_MAP' as const;
export const PROGRESS = 'planet/PROGRESS' as const;
export const FINISH_EXPLORING_MAP = 'planet/FINISH_EXPLORING_MAP' as const;
export const SET_ROTATION = 'planet/SET_ROTATION' as const;
export const SET_ROTATION_MODE = 'planet/SET_ROTATION_MODE' as const;
export const ASSIGN_DROID = 'planet/ASSIGN_DROID' as const;
export const REMOVE_DROID = 'planet/REMOVE_DROID' as const;
export const START_DEVELOPMENT = 'planet/START_DEVELOPMENT' as const;
export const FINISH_DEVELOPMENT = 'planet/FINISH_DEVELOPMENT' as const;
export const SET_EXPLORE_SPEED = 'planet/SET_EXPLORE_SPEED' as const;
export const SET_BEACON = 'planet/SET_BEACON' as const;
export const UNLOCK_TERRAIN = 'planet/UNLOCK_TERRAIN' as const;
export const START_COOK = 'planet/START_COOK' as const;
export const INCREMENT_COOK = 'planet/INCREMENT_COOK' as const;

// The player-driven squad (see lib/planet/squad.ts)
export const SQUAD_ASSIGN_DROID = 'planet/SQUAD_ASSIGN_DROID' as const;
export const SQUAD_REMOVE_DROID = 'planet/SQUAD_REMOVE_DROID' as const;
export const DEPLOY_SQUAD = 'planet/DEPLOY_SQUAD' as const;
export const DISBAND_SQUAD = 'planet/DISBAND_SQUAD' as const;
export const SQUAD_SET_PATH = 'planet/SQUAD_SET_PATH' as const;
export const SQUAD_FACE = 'planet/SQUAD_FACE' as const;
export const ADVANCE_SQUAD = 'planet/ADVANCE_SQUAD' as const;
export const SQUAD_START_FIGHT = 'planet/SQUAD_START_FIGHT' as const;
export const SQUAD_FIGHT_WON = 'planet/SQUAD_FIGHT_WON' as const;
export const SQUAD_LEVEL_WON = 'planet/SQUAD_LEVEL_WON' as const;
export const SQUAD_WIPED = 'planet/SQUAD_WIPED' as const;
export const SQUAD_RETREATED = 'planet/SQUAD_RETREATED' as const;
export const SQUAD_RETREAT_ORDERED = 'planet/SQUAD_RETREAT_ORDERED' as const;
export const SQUAD_USE_EQUIPMENT = 'planet/SQUAD_USE_EQUIPMENT' as const;
export const SQUAD_PROMPT = 'planet/SQUAD_PROMPT' as const;
export const SQUAD_LEAVE_PROMPT = 'planet/SQUAD_LEAVE_PROMPT' as const;
export const SQUAD_RESOLVE_POI = 'planet/SQUAD_RESOLVE_POI' as const;
export const REVEAL_POI = 'planet/REVEAL_POI' as const;
export const SQUAD_CROSS_TUNNEL = 'planet/SQUAD_CROSS_TUNNEL' as const;
export const SQUAD_DELIVER_CARGO = 'planet/SQUAD_DELIVER_CARGO' as const;

export type PlanetAction =
    | { type: typeof GENERATE_MAP; payload: { map: PlanetMap; homeCoord: Coord; pois: PlanetState['pois'] } }
    /** newRotation is absent when the camera isn't being driven this tick (0 is a real rotation, the seam) */
    | { type: typeof PROGRESS; payload: { newRotation?: number; droids: ScoutDroid[]; reveals: Coord[];
        revealedFlatland: number; numArrivedHome: number } }
    | { type: typeof FINISH_EXPLORING_MAP }
    | { type: typeof SET_ROTATION; payload: { value: number } }
    | { type: typeof SET_ROTATION_MODE; payload: { mode: RotationMode } }
    /** amount is the SPAWNED count (what the resources reducer debits); turnAroundIndices are recalled scouts resuming */
    | { type: typeof ASSIGN_DROID; payload: { amount: number; turnAroundIndices: number[] } }
    /** recalls walk home along `path`; instantIndices despawn now */
    | { type: typeof REMOVE_DROID; payload: { recalls: { index: number; path: Coord[] }[]; instantIndices: number[] } }
    | { type: typeof START_DEVELOPMENT; payload: { coords: Coord[] } }
    | { type: typeof FINISH_DEVELOPMENT; payload: { coords: Coord[] } }
    | { type: typeof SET_EXPLORE_SPEED; payload: { value: number } }
    | { type: typeof SET_BEACON; payload: { coord: Coord | null } }
    | { type: typeof UNLOCK_TERRAIN; payload: { upgrade: string } }
    | { type: typeof START_COOK }
    | { type: typeof INCREMENT_COOK; payload: { timeDelta: number } }
    | { type: typeof SQUAD_ASSIGN_DROID; payload: { amount: number } }
    | { type: typeof SQUAD_REMOVE_DROID; payload: { amount: number } }
    | { type: typeof DEPLOY_SQUAD; payload: { assignedDroids: number; multiplier: number; equipment: EquipmentCharges;
        droidStats: DroidStats; batteryCapacity: number } }
    | { type: typeof DISBAND_SQUAD; payload: { droidsReturned: number; cargo: ResourceAmounts } }
    | { type: typeof SQUAD_SET_PATH; payload: { path: Coord[] } }
    | { type: typeof SQUAD_FACE; payload: { facing: [number, number] } }
    | { type: typeof ADVANCE_SQUAD; payload: { squad: Squad | null; reveals: Coord[]; revealedFlatland: number } }
    | { type: typeof SQUAD_START_FIGHT; payload: { poiId: string; fromCoord: Coord; battle: Battle; level: number } }
    | { type: typeof SQUAD_FIGHT_WON; payload: { poiId: string; survivors: number; droidHp: number[]; reward: PoiReward;
        landCredit: number; result: EncounterResult } }
    /** a level of a multi-level settlement fell with more beneath it: the site stands, the popup offers the descent */
    | { type: typeof SQUAD_LEVEL_WON; payload: { poiId: string; level: number; survivors: number; droidHp: number[];
        reward: PoiReward; fromCoord?: Coord; result: EncounterResult } }
    | { type: typeof SQUAD_WIPED; payload: { poiId: string; result: EncounterResult } }
    | { type: typeof SQUAD_RETREATED; payload: { poiId: string; survivors: number; droidHp: number[] } }
    | { type: typeof SQUAD_RETREAT_ORDERED }
    | { type: typeof SQUAD_USE_EQUIPMENT; payload: { itemId: EquipmentId } }
    | { type: typeof SQUAD_PROMPT; payload: { poiId: string; phase?: 'offer' | 'approach'; fromCoord?: Coord; sprungAt?: number } }
    | { type: typeof SQUAD_LEAVE_PROMPT }
    /** battery is a delta on the squad (clamped to capacity); units join the roster at full hull */
    | { type: typeof SQUAD_RESOLVE_POI; payload: { poiId: string; reward: PoiReward; result: EncounterResult | null;
        battery?: number; units?: number } }
    /** a concealed POI found (stepped on, or traced by a signal): it shows from here on, its tile marked */
    | { type: typeof REVEAL_POI; payload: { poiId: string } }
    /** an open tunnel crossed: the squad reappears at the far mouth, the battery lighter by `cost` */
    | { type: typeof SQUAD_CROSS_TUNNEL; payload: { poiId: string; exitCoord: Coord; cost: number } }
    | { type: typeof SQUAD_DELIVER_CARGO; payload: { cargo: ResourceAmounts } };

// Initial State
const initialState: PlanetState = {
    map: [],
    homeCoord: null, // [row, col] of the command center; droids spawn here
    overallStatus: 'unstarted',
    rotation: 0.5,
    rotationMode: 'manual', // who drives the camera (see RotationMode)
    droidData: { // This object mirrors 'structure' format so they can be polymorphic
        numDroidsAssigned: 0,
        droidAssignmentType: 'planet'
    },
    // The expedition team standing by at base, assigned like a structure's droids (out of the idle pool while
    // they wait). Deploying moves them onto the squad (this drops to 0 while it is fielded); disbanding puts the
    // recovered droids back here, so the same team is ready to go again.
    squadDroidData: {
        numDroidsAssigned: 0,
        droidAssignmentType: 'squad'
    },
    // One entity per assigned droid: { coord: [row,col]|null, path, target, moveProgress, heading, docked?,
    // docking?, returning? }. Kept in lockstep with droidData.numDroidsAssigned. Scouts are grid remotes:
    // they start docked (no coord; "in the grid"), surface on the powered tile nearest their work, and walk
    // back into the nearest powered tile when the sweep is done (docking) or they're unassigned (returning).
    droids: [],
    unlockedTerrains: {}, // e.g. { mountaineering: true } once researched; gates which terrain droids can cross
    haloRadius: SURVEY_HALO_RADIUS, // scout uplink range in hops from the powered grid; comms upgrades raise it
    beaconCoord: null, // [row, col] growth beacon: replication grows toward it (nearest home when null)
    exploreSpeed: 1,
    cookedPct: 0, // How much of the entire planet is on fire :P

    // Cached counts (cheaper than scanning the map each render). TODO use reselect instead?
    numExplored: 0, // Number of revealed sectors
    maxDevelopedLand: 0,

    // POIs and the driven squad (see lib/planet/pois.ts and lib/planet/squad.ts for domain logic and shapes)
    pois: {},     // by poiId; seeded at GENERATE_MAP, discovered (hidden -> available) as scouting reveals their tiles
    squad: null, // the player-driven squad (see createSquad): { coord, path, moveProgress, battery,
                 // assignedDroids, multiplier, squadSize (effective units), cargo, equipment, droidHp, fighting }
    // The encounter popup's state: null | { poiId, phase: 'offer'|'result', result }. Planet-level (not on the
    // squad) so a wipe can still narrate its ending after the squad object is gone.
    prompt: null,
    battlesFought: 0, // fights that have ended, whatever the outcome (the first one opens the schematic index)
    squadsReturned: 0 // squads disbanded back at base (a wipe is not a return; the replication beat waits for one)
}

// Reducer
export default function reducer(state: PlanetState = initialState, action: GameAction): PlanetState {
    let updates: Record<string, any>;

    switch (action.type) {
        case GENERATE_MAP:
            return update(state, {
                map: { $set: action.payload.map },
                homeCoord: { $set: action.payload.homeCoord },
                numExplored: { $set: numSectorsMatching(action.payload.map, STATUSES.explored.key) },
                maxDevelopedLand: { $set: numSectorsMatching(action.payload.map, undefined, TERRAINS.flatland.key) + 1 }, // add 1 for home base
                pois: { $set: action.payload.pois },
                squad: { $set: null },
                prompt: { $set: null },
                beaconCoord: { $set: null }
            })
        case PROGRESS:
            updates = {
                droids: { $set: action.payload.droids }
            }

            if (action.payload.newRotation !== undefined) { // 0 is a real rotation (the seam), not "no update"
                updates.rotation = { $set: action.payload.newRotation };
            }

            addRevealUpdates(state, updates, action.payload.reveals);

            return update(state, updates);
        case FINISH_EXPLORING_MAP:
            return update(state, {
                overallStatus: { $set: 'finished' },
            })
        case SET_ROTATION:
            return update(state, {
                rotation: { $set: action.payload.value }
            })
        case SET_ROTATION_MODE:
            return update(state, {
                rotationMode: { $set: action.payload.mode }
            })
        case ASSIGN_DROID: {
            // payload.amount fresh droids spawn docked (in the grid; they surface wherever there's work);
            // payload.turnAroundIndices are returning droids that turn around in place (recall undone) and
            // resume exploring from wherever they stand next tick.
            const turnAroundSet = new Set(action.payload.turnAroundIndices || []);
            const spawned: ScoutDroid[] = [];
            for (let i = 0; i < action.payload.amount; i++) {
                spawned.push({ docked: true, coord: null, path: [], target: null, moveProgress: 0, heading: null });
            }
            return update(state, {
                droidData: { numDroidsAssigned: { $apply: (x: number) => x + action.payload.amount + turnAroundSet.size } },
                droids: {
                    $apply: (droids: ScoutDroid[]) => droids
                        .map((droid: ScoutDroid, i: number) => turnAroundSet.has(i) ?
                            { ...droid, returning: false, path: [], target: null, moveProgress: 0, heading: null } :
                            droid)
                        .concat(spawned)
                }
            });
        }
        case REMOVE_DROID: {
            // Removal is a recall: the droid stops exploring NOW (numDroidsAssigned drops immediately) but walks
            // home and only rejoins the idle pool on arrival (see numArrivedHome on PROGRESS). Droids with no
            // position/route (payload.instantIndices) despawn immediately and credit on this action instead.
            const recallByIndex: Record<number, { index: number, path: Coord[] }> = {};
            action.payload.recalls.forEach((recall: { index: number, path: Coord[] }) => { recallByIndex[recall.index] = recall; });
            const instantSet = new Set(action.payload.instantIndices);
            const numRemoved = action.payload.recalls.length + action.payload.instantIndices.length;

            return update(state, {
                droidData: { numDroidsAssigned: { $apply: (x: number) => x - numRemoved } },
                droids: {
                    $apply: (droids: ScoutDroid[]) => droids
                        .map((droid: ScoutDroid, i: number) => recallByIndex[i] ?
                            // docking cleared: a recall outranks docking (and must not be re-tasked as one)
                            { ...droid, returning: true, docking: false, target: null, heading: null, path: recallByIndex[i].path, moveProgress: 0 } :
                            droid)
                        .filter((droid: ScoutDroid, i: number) => !instantSet.has(i))
                }
            });
        }
        case START_DEVELOPMENT:
            updates = { map: {} }
            action.payload.coords.forEach((coord: Coord) => {
                if (updates.map[coord[0]] === undefined) { updates.map[coord[0]] = {} }
                updates.map[coord[0]][coord[1]] = {
                    terrain: { $set: TERRAINS.developing.key }
                }
            })
            return update(state, updates);
        case FINISH_DEVELOPMENT:
            // Construction complete: the tiles power up NOW, extending the survey halo. Clear any 'finished'
            // status: freshly in-range ground may be sweepable again.
            updates = {
                map: {},
                overallStatus: { $set: 'inProgress' }
            }
            action.payload.coords.forEach((coord: Coord) => {
                if (updates.map[coord[0]] === undefined) { updates.map[coord[0]] = {} }
                updates.map[coord[0]][coord[1]] = {
                    terrain: { $set: TERRAINS.developed.key }
                }
            })
            return update(state, updates);
        case SET_EXPLORE_SPEED:
            return update(state, {
                exploreSpeed: { $set: action.payload.value }
            })
        case SET_BEACON:
            return update(state, {
                beaconCoord: { $set: action.payload.coord }
            })
        case UNLOCK_TERRAIN:
            // A terrain-crossing upgrade (e.g. mountaineering) makes that terrain passable, which re-opens frontier.
            // Clear any 'finished' status so planetTick resumes exploring the newly-reachable ground.
            return update(state, {
                unlockedTerrains: { [action.payload.upgrade]: { $set: true } },
                overallStatus: { $set: 'inProgress' }
            })
        case START_COOK:
            return update(state, {
                cookedPct: { $set: 0.01 }
            })
        case INCREMENT_COOK:
            return update(state, {
                cookedPct: { $apply: (x: number) => Math.min(x + (action.payload.timeDelta / COOK_TIME), 1) }
            })

        case SQUAD_ASSIGN_DROID:
            return update(state, {
                squadDroidData: { numDroidsAssigned: { $apply: (x: number) => x + action.payload.amount } }
            });
        case SQUAD_REMOVE_DROID:
            return update(state, {
                squadDroidData: { numDroidsAssigned: { $apply: (x: number) => x - action.payload.amount } }
            });
        case DEPLOY_SQUAD:
            if (!state.homeCoord) return state; // no map generated yet
            return update(state, {
                squadDroidData: { numDroidsAssigned: { $set: 0 } }, // the team is on the squad now
                squad: { $set: createSquad(state.homeCoord, action.payload.assignedDroids, action.payload.multiplier,
                    action.payload.equipment, action.payload.droidStats, action.payload.batteryCapacity) }
            });
        case DISBAND_SQUAD:
            return update(state, {
                squadDroidData: { numDroidsAssigned: { $set: action.payload.droidsReturned } },
                squad: { $set: null },
                prompt: { $set: null },
                squadsReturned: { $set: (state.squadsReturned || 0) + 1 }
            });
        case SQUAD_FACE:
            // The way the driver is looking (screen-space [dx, dy]); drives the Expedition panel's vista.
            // Set on every attempted step, so bumping into a ridge turns the team to face it.
            if (!state.squad) return state;
            return update(state, { squad: { facing: { $set: action.payload.facing } } });
        case SQUAD_SET_PATH:
            // Safety net: any new path clears a lingering prompt (the input layer blocks movement while one
            // is open, so this shouldn't fire in practice)
            return update(state, {
                squad: {
                    path: { $set: action.payload.path },
                    moveProgress: { $set: 0 }
                },
                prompt: { $set: null }
            });
        case SQUAD_START_FIGHT:
            // Standing on the settlement: the live battle sim starts NOW (see lib/battle.ts) and plays out in the
            // encounter popup. Movement locks until it resolves. Watching the field reveals the true strength.
            // fromCoord rides along so a retreat can fall back to the tile the squad came in from.
            return update(state, {
                squad: {
                    path: { $set: [] },
                    moveProgress: { $set: 0 },
                    // The contact beat (the squad dropping into the settlement on the map) only plays for the surface
                    // fight of a site the squad chose to enter; a descent starts its battle at once, the squad is
                    // already inside, and a concealed site (a camp, an ambush) had its beat before the approach card
                    // (the glyph blinking where it was sprung), so its fight opens the moment the card is answered.
                    fighting: { $set: { poiId: action.payload.poiId, battle: action.payload.battle,
                        fromCoord: action.payload.fromCoord, level: action.payload.level,
                        contactMs: action.payload.level > 0 || state.pois[action.payload.poiId]?.concealed ? CONTACT_MS : 0 } }
                },
                pois: { [action.payload.poiId]: { difficultyKnown: { $set: true } } },
                prompt: { $set: null }
            });
        case SQUAD_PROMPT:
            // Standing on a cache/story tile (offer) or a garrisoned site (approach): movement locks until the
            // player answers
            return update(state, {
                squad: {
                    path: { $set: [] },
                    moveProgress: { $set: 0 }
                },
                prompt: { $set: { poiId: action.payload.poiId, phase: action.payload.phase || 'offer',
                    ...(action.payload.fromCoord ? { fromCoord: action.payload.fromCoord } : {}),
                    ...(action.payload.sprungAt != null ? { sprungAt: action.payload.sprungAt } : {}) } }
            });
        case SQUAD_LEAVE_PROMPT:
            return update(state, {
                prompt: { $set: null }
            });
        case SQUAD_FIGHT_WON: {
            // The battle's outcome shows in the encounter popup's result phase (losses, reclaimed land, loot)
            const won = state.pois[action.payload.poiId];
            updates = {
                pois: { [action.payload.poiId]: { status: { $set: 'cleared' } } },
                squad: {
                    squadSize: { $set: action.payload.survivors },
                    droidHp: { $set: action.payload.droidHp },
                    cargo: { $apply: (cargo: ResourceAmounts) => mergeCargo(cargo, action.payload.reward) }
                },
                prompt: { $set: { poiId: action.payload.poiId, phase: 'result', result: action.payload.result } },
                battlesFought: { $set: state.battlesFought + 1 }
            };

            // The settlement is dead: its territory stamp retracts (the land becomes sweepable and developable
            // again, so any 'finished' exploration status is cleared too)
            const settlement = state.pois[action.payload.poiId];
            if (settlement && settlement.territoryRadius != null) {
                updates.map = {};
                [settlement.coord, ...getCoordsWithinHops(settlement.coord, settlement.territoryRadius)].forEach(([r, c]) => {
                    if (state.map[r][c].heldBy === action.payload.poiId) {
                        if (updates.map[r] === undefined) updates.map[r] = {};
                        updates.map[r][c] = { heldBy: { $set: null } };
                    }
                });
                updates.overallStatus = { $set: 'inProgress' };
            }

            // Its camps go with it: whoever was still out on the held ground scatters (no fight, no loot),
            // so nothing is left standing on land that is about to be developed
            Object.values(state.pois).forEach(poi => {
                if (poi.parentId === action.payload.poiId && poi.status !== 'cleared') {
                    updates.pois[poi.id] = { status: { $set: 'cleared' } };
                }
            });

            // A network site secured: its tile becomes an outpost, powered ground of the player's own (see
            // TERRAINS.outpost). The cleared marker goes; the terrain carries the glyph from here on.
            if (won && won.type === 'settlement' && won.site != null) {
                updates.map = updates.map || {};
                updates.map[won.coord[0]] = updates.map[won.coord[0]] || {};
                updates.map[won.coord[0]][won.coord[1]] = { ...(updates.map[won.coord[0]][won.coord[1]] || {}),
                    terrain: { $set: TERRAINS.outpost.key } };
            }

            // A tunnel fought through: the squad comes out the far mouth, and both mouths stay on the map as
            // an open passage (never 'cleared', which would hide them) offering the crossing from now on
            if (won && won.type === 'tunnel') {
                updates.pois[won.id] = { open: { $set: true } };
                Object.values(state.pois).forEach(poi => {
                    if (poi.type === 'tunnel' && poi.tunnel === won.tunnel) updates.pois[poi.id] = { open: { $set: true } };
                });
                if (won.exitCoord) updates.squad.coord = { $set: won.exitCoord };
            }

            return update(state, updates);
        }
        case SQUAD_LEVEL_WON: {
            // A level fell but the site has more beneath it: loot loads, wounds carry, and the popup holds on
            // the descend-or-withdraw choice. The settlement stays 'available' (it only falls with its last level);
            // the win is counted against the level so a later assault finds it poorer (see levelPayout).
            const { poiId, level } = action.payload;
            return update(state, {
                pois: { [poiId]: { levels: { [level]: { timesCleared: { $apply: (times: number) => times + 1 } } } } },
                squad: {
                    squadSize: { $set: action.payload.survivors },
                    droidHp: { $set: action.payload.droidHp },
                    cargo: { $apply: (cargo: ResourceAmounts) => mergeCargo(cargo, action.payload.reward) }
                },
                prompt: { $set: { poiId, phase: 'result', result: action.payload.result,
                    fromCoord: action.payload.fromCoord } },
                battlesFought: { $set: state.battlesFought + 1 }
            });
        }
        case SQUAD_WIPED:
            // Failed assault: squad and cargo are gone. The ending narrates in the popup
            // (planet-level prompt, so it survives the squad's deletion). The settlement resets to full
            // strength (each side heals at home), so the next assault must be decisive too.
            return update(state, {
                squad: { $set: null },
                prompt: { $set: { poiId: action.payload.poiId, phase: 'result', result: action.payload.result } },
                battlesFought: { $set: state.battlesFought + 1 }
            });
        case SQUAD_RETREATED:
            // Withdrawal complete: the escapees keep driving (no popup to dismiss mid-flight), carrying
            // their wounds; the settlement restores itself to full strength behind them.
            return update(state, {
                squad: {
                    squadSize: { $set: action.payload.survivors },
                    droidHp: { $set: action.payload.droidHp }
                },
                battlesFought: { $set: state.battlesFought + 1 }
            });
        case SQUAD_RETREAT_ORDERED:
            return update(state, {
                squad: { fighting: { battle: { $apply: startWithdrawal } } }
            });
        case SQUAD_USE_EQUIPMENT:
            return update(state, {
                squad: {
                    equipment: { [action.payload.itemId]: { $apply: (charges: number) => charges - 1 } },
                    fighting: { battle: { $apply: (battle) => applyEquipment(battle, action.payload.itemId) } }
                }
            });
        case SQUAD_RESOLVE_POI: {
            // Player chose to take/explore/open the site: clear it and load any reward as cargo. A 'narrate'
            // POI holds the popup open on its result phase (story text, salvage); 'auto' closes it here.
            updates = {
                pois: { [action.payload.poiId]: { status: { $set: 'cleared' } } },
                squad: {
                    cargo: { $apply: (cargo: ResourceAmounts) => mergeCargo(cargo, action.payload.reward) }
                },
                prompt: { $set: action.payload.result ?
                    { poiId: action.payload.poiId, phase: 'result', result: action.payload.result } : null }
            };
            // A field event's answer can touch the squad itself: cells found (or spent), a droid recovered
            if (action.payload.battery && state.squad) {
                const capacity = squadBatteryCapacity(state.squad);
                updates.squad.battery = { $apply: (battery: number) =>
                    Math.max(0, Math.min(capacity, battery + action.payload.battery!)) };
            }
            if (action.payload.units && state.squad) {
                const maxHp = (state.squad.droidStats || DROID_BASE_STATS).hp;
                updates.squad.squadSize = { $apply: (size: number) => size + action.payload.units! };
                updates.squad.droidHp = { $apply: (droidHp: number[]) =>
                    [...(droidHp || fullDroidHp(state.squad!.squadSize, maxHp)), ...fullDroidHp(action.payload.units!, maxHp)] };
            }
            return update(state, updates);
        }
        case REVEAL_POI: {
            // A concealed POI found: it shows on the map from here on (its tile marked explored if it wasn't)
            const found = state.pois[action.payload.poiId];
            if (!found) return state;
            updates = { pois: { [found.id]: { status: { $set: 'available' } } } };
            if (state.map[found.coord[0]][found.coord[1]].status === STATUSES.unknown.key) {
                addRevealUpdates(state, updates, [found.coord]);
                updates.pois[found.id] = { status: { $set: 'available' } }; // over the reveal pass's (concealed skip)
            }
            return update(state, updates);
        }
        case SQUAD_CROSS_TUNNEL:
            return update(state, {
                squad: {
                    coord: { $set: action.payload.exitCoord },
                    path: { $set: [] },
                    moveProgress: { $set: 0 },
                    battery: { $apply: (battery: number) => Math.max(0, battery - action.payload.cost) }
                },
                prompt: { $set: null }
            });
        case SQUAD_DELIVER_CARGO:
            return update(state, {
                squad: { cargo: { $set: {} } }
            });
        case ADVANCE_SQUAD:
            // Wholesale snapshot from the pure advanceSquad, plus its line-of-sight reveals (same treatment
            // as scout reveals on PROGRESS: mark explored, discover POIs; resources credits land off this action).
            updates = {
                squad: { $set: action.payload.squad }
            };
            addRevealUpdates(state, updates, action.payload.reveals);
            return update(state, updates);
        default:
            return state;
    }
}

// Folds a POI reward's resources into the squad's cargo (pure).
function mergeCargo(cargo: ResourceAmounts, reward: PoiReward) {
    if (!(reward && reward.resources)) return cargo || {};
    const next: ResourceAmounts = { ...(cargo || {}) };
    typedEntries(reward.resources).forEach(([id, amount]) => {
        next[id] = (next[id] || 0) + amount;
    });
    return next;
}

// Shared by PROGRESS (scout reveals) and ADVANCE_SQUAD (squad reveals): mutates `updates` to mark the given
// tiles explored, bump numExplored, and flip any hidden POI on a revealed tile to available.
function addRevealUpdates(state: PlanetState, updates: Record<string, any>, reveals: Coord[]) {
    if (!reveals || reveals.length === 0) return;

    updates.map = updates.map || {};
    reveals.forEach(([rowIndex, colIndex]) => {
        if (updates.map[rowIndex] === undefined) updates.map[rowIndex] = {};
        updates.map[rowIndex][colIndex] = { status: { $set: STATUSES.explored.key } };
    });
    updates.numExplored = { $apply: (x: number) => x + reveals.length };
    updates.overallStatus = { $set: 'inProgress' };

    // POI discovery: a hidden POI whose tile just got revealed becomes available (shows on map + sidebar).
    // Concealed ones (camps, field events) stay hidden: seeing the ground doesn't find them, stepping on it does.
    const revealKeys = new Set(reveals.map(([r, c]) => `${r},${c}`));
    Object.values(state.pois).forEach(poi => {
        if (poi.status === 'hidden' && !poi.concealed && revealKeys.has(`${poi.coord[0]},${poi.coord[1]}`)) {
            if (updates.pois === undefined) updates.pois = {};
            updates.pois[poi.id] = { status: { $set: 'available' } };
        }
    });
}


// Action Creators
export function setRotation(value: number): PlanetAction {
    return { type: SET_ROTATION, payload: { value } }
}
export function setRotationMode(mode: RotationMode): PlanetAction {
    return { type: SET_ROTATION_MODE, payload: { mode } }
}
export function startCooking(): PlanetAction {
    return { type: START_COOK }
}

export function generateMap(): PlanetAction {
    const map = generatePlanetMap(EXPLORE_EVERYTHING); // dev skip, read at call time (see dev/skips.ts)
    const homeCoord = getHomeBasePosition(map).coord;
    const pois = generatePois(map); // also stamps territory flags onto the map
    return { type: GENERATE_MAP, payload: { map, homeCoord, pois } };
}

// Assigning prefers turning around droids that are currently walking home (farthest from home first -- they save
// the most walking); only the remainder spawns fresh from the idle pool. payload.amount is the SPAWNED count,
// which is what the resources reducer debits.
export function assignDroidUnsafe(amount = 1) {
    return withRecalculation(function(dispatch, getState) {
        const planet = getState().planet;

        const turnAroundIndices = planet.droids
            .map((droid, index) => ({ droid, index }))
            .filter(({ droid }) => droid.returning)
            .sort((a, b) => {
                const distance = ({ droid }: { droid: ScoutDroid }) => droid.coord ? planet.map[droid.coord[0]][droid.coord[1]].graphDistanceHome : 0;
                return distance(b) - distance(a);
            })
            .slice(0, amount)
            .map(({ index }) => index);

        dispatch({ type: ASSIGN_DROID, payload: { amount: amount - turnAroundIndices.length, turnAroundIndices } });
    });
}

// Removing scout droids recalls them: docked ones despawn instantly (they're already in the grid), fielded
// ones walk to the NEAREST powered tile before rejoining the idle pool (the grid is one base; there's no
// reason to trek to the command center specifically). The thunk picks the droids and computes their return
// paths; the reducer applies flags and despawns instants.
export function removeDroidUnsafe(amount = 1) {
    return withRecalculation(function(dispatch, getState) {
        const planet = getState().planet;

        // Only active (non-returning) droids are eligible; recall the cheapest first (docked, then nearest home)
        const candidates = planet.droids
            .map((droid, index) => ({ droid, index }))
            .filter(({ droid }) => !droid.returning)
            .sort((a, b) => {
                const distance = ({ droid }: { droid: ScoutDroid }) => droid.coord ? planet.map[droid.coord[0]][droid.coord[1]].graphDistanceHome : -1;
                return distance(a) - distance(b);
            })
            .slice(0, amount);

        const recalls: { index: number, path: Coord[] }[] = [];
        const instantIndices: number[] = [];
        candidates.forEach(({ droid, index }) => {
            const path = droid.coord ?
                findPathToGrid(planet.map, droid.coord, { unlocks: planet.unlockedTerrains }) : null;

            if (path && path.length > 0) {
                recalls.push({ index, path });
            }
            else {
                instantIndices.push(index); // docked, already on powered ground, or unroutable: despawn + credit immediately
            }
        });

        dispatch({ type: REMOVE_DROID, payload: { recalls, instantIndices } });
    });
}

// Kept for the log/trigger flow that still references it. Exploration now runs automatically as droids are assigned
// (the droid entities drive it), so this is a no-op.
export function startExploringMap() {
    return () => {};
}

function finishExploringMap(): PlanetAction {
    return { type: FINISH_EXPLORING_MAP };
}

export function startDevelopment(dispatch: Dispatch, getState: GetState, size: number) {
    const planet = getState().planet;
    // Growth flows toward the beacon when one is set, otherwise stays huddled around home
    const anchorCoord = planet.beaconCoord || planet.homeCoord;
    const coords = getNextDevelopmentArea(planet.map, size, anchorCoord);
    dispatch({ type: START_DEVELOPMENT, payload: { coords } })
    dispatch(recalculateState());
}
export function finishDevelopment(dispatch: Dispatch, getState: GetState) {
    const coords = getCurrentDevelopmentArea(getState().planet.map);
    dispatch({ type: FINISH_DEVELOPMENT, payload: { coords } });
    dispatch(recalculateState());
}

export function setExploreSpeed(value: number): PlanetAction {
    return { type: SET_EXPLORE_SPEED, payload: { value } }
}

// Growth beacon (ships with Survey Automation): one optional map click sets the expansion vector; replication
// then consumes frontier tiles nearest it (nearest home when unset). Clicking the beacon's own tile clears it.
export function setBeaconAt(coord: Coord) {
    return function(dispatch: Dispatch, getState: GetState) {
        if (!surveyAutomationUnlocked(getState())) return;

        const current = getState().planet.beaconCoord;
        const clearing = current && current[0] === coord[0] && current[1] === coord[1];
        dispatch({ type: SET_BEACON, payload: { coord: clearing ? null : coord } });
    }
}

export function clearBeacon(): PlanetAction {
    return { type: SET_BEACON, payload: { coord: null } };
}

// Marks a terrain-crossing upgrade as researched (e.g. 'mountaineering'), making that terrain passable and resuming
// exploration. Call this from the upgrade's onFinish; `upgrade` must match the terrain's `crossUpgrade` key.
export function unlockTerrain(upgrade: string): PlanetAction {
    return { type: UNLOCK_TERRAIN, payload: { upgrade } };
}

// isExplorationComplete scans the whole map, and the tick asks 30 times a second while the answer only changes
// when a tile is revealed (new map object), the halo grows or a terrain unlocks. Remember the last answer.
let completionMemo: { map: PlanetMap; haloRadius: number; unlockedTerrains: unknown; complete: boolean } | null = null;
function explorationComplete(planet: PlanetState, halo: ReturnType<typeof getGridHalo>['halo']): boolean {
    if (completionMemo && completionMemo.map === planet.map && completionMemo.haloRadius === planet.haloRadius &&
        completionMemo.unlockedTerrains === planet.unlockedTerrains) {
        return completionMemo.complete;
    }
    const complete = isExplorationComplete(planet.map, planet.unlockedTerrains, halo);
    completionMemo = { map: planet.map, haloRadius: planet.haloRadius, unlockedTerrains: planet.unlockedTerrains, complete };
    return complete;
}

export function planetTick(timeDelta: number) {
    return (dispatch: Dispatch, getState: GetState) => {
        batch(() => {
            const state = getState().planet;

            // The map is generated partway through startup; until then there's nothing to simulate. Guard against it,
            // because isExplorationComplete([]) is vacuously true and would wrongly flip overallStatus to 'finished'
            // before the planet exists -- which then makes the skip-when-finished below freeze exploration for good.
            if (state.map.length === 0) return;

            if (state.cookedPct > 0) {
                dispatch({ type: INCREMENT_COOK, payload: { timeDelta } });
            }

            let newRotation;
            if (state.rotationMode === 'sun') {
                newRotation = sunTrackingRotation(fromClock.fractionOfDay(getState().clock));
            }

            // Advance the squad (movement or fight countdown + line-of-sight reveals + battery). Runs before
            // the finished-map early-return so driving keeps working on a fully-explored map.
            let planetState = state;
            if (state.squad && (state.squad.path.length > 0 || state.squad.fighting)) {
                const { squad, reveals, events } = advanceSquad(
                    state.map, state.pois, state.squad, timeDelta, state.unlockedTerrains
                );
                const revealedFlatland = reveals.filter(
                    ([r, c]) => state.map[r][c].terrain === TERRAINS.flatland.key && !state.map[r][c].heldBy
                ).length;
                dispatch({ type: ADVANCE_SQUAD, payload: { squad, reveals, revealedFlatland } });
                if (revealedFlatland > 0) {
                    dispatch(recalculateState());
                }

                events.forEach(event => resolveSquadEvent(dispatch, getState, squad, event));

                // Scouts below must see the squad's reveals as already-applied, or a tile revealed by both in
                // the same tick would double-count numExplored.
                planetState = getState().planet;
            }

            if (state.rotationMode === 'squad') {
                // Follow the squad; with nobody deployed, center home base instead. Computed AFTER the advance
                // so the camera snaps its column in the same tick the squad arrives -- the render-side
                // cameraShift (see planet.jsx) returns to 0 at that exact moment, keeping the scroll seamless.
                const focusCoord = (planetState.squad && planetState.squad.coord) ?
                    planetState.squad.coord : state.homeCoord;
                if (focusCoord) {
                    newRotation = centeringRotation(focusCoord);
                }
            }

            const finished = planetState.overallStatus === 'finished';
            // Settled = docked (or never fielded); returning/docking walkers still need ticks to reach the grid
            const allSettled = planetState.droids.every(droid => droid.docked || !droid.coord);

            // Once exploration is finished there's nothing to path, so skip the frontier scan + droid work entirely
            // (keeps end-state catch-up after a long tab-away ~free). This is re-armed by ASSIGN_DROID and by
            // FINISH_DEVELOPMENT (halo growth) -- so it never permanently locks out droids that could still do work.
            // Exception: droids still walking to the grid (recalled or docking) must keep advancing.
            if (finished && allSettled) {
                if (newRotation !== undefined) {
                    dispatch({ type: PROGRESS, payload: { newRotation, droids: planetState.droids, reveals: [], revealedFlatland: 0, numArrivedHome: 0 } });
                }
                return;
            }

            // Scouts sweep coverage, never frontier: their targets are bounded to the grid halo (see getGridHalo).
            const { halo } = getGridHalo(planetState.map, planetState.haloRadius);

            // Don't bother re-targeting idle droids once there's nothing left to reach (avoids a pathfind per idle droid).
            const complete = finished || explorationComplete(planetState, halo);

            const { droids, reveals, numArrivedHome } = advanceDroids(
                planetState.map, planetState.droids, timeDelta * planetState.exploreSpeed, planetState.unlockedTerrains, !complete, halo
            );

            // Newly-revealed flatland becomes buildable land (resources reducer listens for this on PROGRESS).
            // Held flatland doesn't count -- it credits later, when its settlement is cleared.
            const revealedFlatland = reveals.filter(
                ([r, c]) => planetState.map[r][c].terrain === TERRAINS.flatland.key && !planetState.map[r][c].heldBy
            ).length;

            dispatch({ type: PROGRESS, payload: { newRotation, droids, reveals, revealedFlatland, numArrivedHome } });

            if (complete && !finished) {
                dispatch(finishExploringMap());
            }
        });
    }
}



/**
 * --- Squad thunks ---
 * Thunks validate; reducers apply. All squad/POI state is serializable, so mid-flight saves resume cleanly.
 * Movement thunks return booleans so the planet component can distinguish "order accepted" from "blocked"
 * (which it renders as a bump).
 */

// Ambient expedition telemetry (cargo banked, sealed sites, disband summaries) goes to the main terminal as
// inline lines; anything the player is standing in front of narrates through the encounter popup instead.

function sealedText(poi: Poi) {
    const tool = poi.requires ? (CAPABILITY_LABELS[poi.requires] || poi.requires) : 'an unknown tool';
    return TELEMETRY.sealed(poi.name, tool);
}

// Assigning to / removing from the team standing by at base (see squadDroidData). The reducer.ts wrappers check
// the idle pool and that no squad is fielded.
export function squadAssignDroidUnsafe(amount = 1): PlanetAction {
    return { type: SQUAD_ASSIGN_DROID, payload: { amount } };
}
export function squadRemoveDroidUnsafe(amount = 1): PlanetAction {
    return { type: SQUAD_REMOVE_DROID, payload: { amount } };
}

// Deploying fields the team assigned at base (already out of the idle pool, so deploying itself costs
// nothing more). Replication multiplies them: the fielded roster is
// assignedDroids x multiplier effective units, snapshotted at deploy (replicating afterward doesn't grow a
// fielded squad). The squad automatically carries every owned equipment piece at full charges, and its
// unit stats (base + researched combat upgrades) are snapshotted here: refit at base.
export function deploySquad() {
    return function(dispatch: Dispatch, getState: GetState) {
        const state = getState();
        const planet = state.planet;
        if (planet.squad || !planet.homeCoord) return;
        const assignedDroids = planet.squadDroidData.numDroidsAssigned;
        if (assignedDroids < 1) return;

        dispatch(withRecalculation({ type: DEPLOY_SQUAD,
            payload: { assignedDroids, multiplier: getReplicationMultiplier(state),
                equipment: ownedEquipment(state), droidStats: getDroidStats(state),
                batteryCapacity: getBatteryCapacity(state) } }));
        dispatch(setRotationMode('squad')); // follow-cam makes driving feel right immediately
    }
}

// Disbanding requires standing on the powered grid (walk home first); cargo credits there and the recovered
// droids go back to standing by at base (still assigned to the team, not the idle pool).
// Surviving units settle back into whole droids to the nearest (droidsRecovered): partial losses
// re-replicate at home.
export function disbandSquad() {
    return function(dispatch: Dispatch, getState: GetState) {
        const planet = getState().planet;
        const squad = planet.squad;
        if (!squad || squad.fighting) return;
        if (!isOnGrid(planet.map, squad.coord)) return;

        const droidsReturned = droidsRecovered(squad);
        dispatch(withRecalculation({
            type: DISBAND_SQUAD,
            payload: { droidsReturned, cargo: squad.cargo || {} }
        }));
        const delivered = squad.cargo && Object.keys(squad.cargo).length > 0 ? formatResourceList(squad.cargo) : null;
        const mult = squad.multiplier || 1;
        const roster = mult > 1 ?
            TELEMETRY.rosterMultiplied(squad.squadSize, (squad.assignedDroids || squad.squadSize) * mult, droidsReturned, squad.assignedDroids) :
            TELEMETRY.rosterPlain(droidsReturned);
        dispatch(logInline(TELEMETRY.teamReturned(roster, delivered)));
    }
}

// Keyboard step onto an adjacent tile. Stepping into an unknown impassable tile reveals it (you probed the
// wall and learned something) but does not move -- the caller shows a bump either way on `false`.
// POI blocking (settlements, sealed sites) is the component's concern: it decides bump-vs-attack per input rules.
// Turn the squad to look along dir ([dx, dy] in screen space, see KEY_DIRS in the planet component)
export function squadFace(dir: [number, number]): PlanetAction {
    return { type: SQUAD_FACE, payload: { facing: dir } };
}

export function squadStep(coord: Coord) {
    return function(dispatch: Dispatch, getState: GetState) {
        const planet = getState().planet;
        const squad = planet.squad;
        if (!squad || squad.fighting) return false;

        if (!isPassable(planet.map, coord, planet.unlockedTerrains)) {
            if (planet.map[coord[0]][coord[1]].status === STATUSES.unknown.key) {
                // Reveal the wall: same action shape as movement, with the squad itself unchanged
                dispatch({ type: ADVANCE_SQUAD, payload: { squad, reveals: [coord], revealedFlatland: 0 } });
            }
            return false;
        }

        dispatch({ type: SQUAD_SET_PATH, payload: { path: [coord] } });
        return true;
    }
}

/**
 * The single keyboard entry point: attempt to step onto `coord`. Returns what happened so the component can
 * render it: 'moved' | 'blocked' (bump) | 'busy' (no squad / mid-fight: ignore silently).
 *
 * Contact rules: an available settlement is walked ONTO -- tapped or held (running headlong into a settlement is a
 * fight, Pokemon-grass style; the posted difficulty was your warning) -- and the fight starts on arrival,
 * the same way a cache raises its prompt on arrival. Sealed sites bump (with a report on deliberate taps
 * only, so held keys don't spam it). Hidden blocking POIs reveal on the bump, same as probing an unknown
 * wall -- you discover the danger, and the NEXT step in commits.
 */
export function squadStepInto(coord: Coord, tap: boolean) {
    return function(dispatch: Dispatch, getState: GetState) {
        const planet = getState().planet;
        const squad = planet.squad;
        if (!squad || squad.fighting) return 'busy';

        // A concealed POI still hidden is never a wall: the step onto it is how it is found (see advanceSquad)
        const blockingPoi = Object.values(planet.pois).find(poi =>
            poi.status !== 'cleared' && !(poi.status === 'hidden' && poi.concealed) &&
            poi.coord[0] === coord[0] && poi.coord[1] === coord[1] &&
            (isGarrisoned(poi) || (poi.requires && !planet.unlockedTerrains[poi.requires]))
        );

        if (blockingPoi) {
            if (blockingPoi.status === 'hidden') {
                // Probing the dark found something: reveal it (tile reveal flips the POI to available).
                // Defensive: the squad's own line of sight reveals every tile it can step into, so this
                // shouldn't be reachable unless vision shrinks below one hop.
                dispatch({ type: ADVANCE_SQUAD, payload: { squad, reveals: [coord], revealedFlatland: 0 } });
                return 'blocked';
            }
            if (blockingPoi.requires && !planet.unlockedTerrains[blockingPoi.requires]) {
                if (tap) dispatch(logInline(sealedText(blockingPoi)));
                return 'blocked';
            }
            // An available settlement or camp falls through: it is walkable, and arriving on it starts the fight
        }

        return dispatch(squadStep(coord)) ? 'moved' : 'blocked';
    }
}

// Player accepts the open interaction prompt (take the cache / explore the site, or one of a field event's
// answers by index): resolve the POI, load any reward as cargo, file the report.
export function squadInteract(choiceIndex = 0) {
    return function(dispatch: Dispatch, getState: GetState) {
        const planet = getState().planet;
        const squad = planet.squad;
        if (!squad || !planet.prompt || planet.prompt.phase !== 'offer') return false;

        const poi = planet.pois[planet.prompt.poiId];
        if (!poi || poi.status !== 'available') {
            dispatch({ type: SQUAD_LEAVE_PROMPT });
            return false;
        }

        // A field event's answer carries its own reward and narration; every other POI has one answer, the POI's
        const choice = poi.choices ? poi.choices[choiceIndex] : null;
        if (poi.choices && !choice) return false;
        const reward: PoiReward = choice ? (choice.reward || {}) : poi.reward;
        const storyId = choice ? choice.storyId : poi.storyId;
        const narrate = choice ? !!choice.storyId : resultBehaviorFor(poi) === 'narrate';

        // A 'narrate' POI's outcome shows in the popup's result phase; the fields stay serializable and the
        // display strings are composed at render time (story text lookup, capability label, loot list)
        const result: EncounterResult | null = narrate ? {
            storyId: storyId || null,
            capability: (reward && reward.capability) || null,
            loaded: (reward && reward.resources) || null,
            ...(choice && choice.battery ? { battery: choice.battery } : {}),
            ...(choice && choice.units ? { unitsGained: choice.units } : {})
        } : null;

        dispatch({ type: SQUAD_RESOLVE_POI, payload: { poiId: poi.id, reward, result,
            ...(choice && choice.battery ? { battery: choice.battery } : {}),
            ...(choice && choice.units ? { units: choice.units } : {}) } });
        if (reward && reward.capability) {
            dispatch(unlockTerrain(reward.capability)); // salvaged tool: permanent, instant (not cargo)
        }
        if (choice && choice.revealNearest) revealNearestConcealed(dispatch, getState, poi);
        if (choice && choice.units) dispatch(recalculateState());
        return true;
    }
}

// A traced signal: the nearest concealed POI still hidden (a camp or a field event) shows on the map, and its
// tile is marked so there is something to look at. Nothing to find = the terminal says so.
function revealNearestConcealed(dispatch: Dispatch, getState: GetState, from: Poi) {
    const pois = getState().planet.pois;
    let nearest: Poi | null = null;
    let nearestDistance = Infinity;
    Object.values(pois).forEach(poi => {
        if (poi.id === from.id || poi.status !== 'hidden' || !poi.concealed) return;
        const distance = getApproxDistance(from.coord, poi.coord);
        if (distance < nearestDistance) { nearest = poi; nearestDistance = distance; }
    });
    if (!nearest) {
        dispatch(logInline(TELEMETRY.signalTracedNone()));
        return;
    }
    dispatch({ type: REVEAL_POI, payload: { poiId: (nearest as Poi).id } });
    dispatch(logInline(TELEMETRY.signalTraced((nearest as Poi).name)));
}

// Player declines the offer (or continues past a result); the popup's only exits besides accepting.
export function squadLeavePrompt(): PlanetAction {
    return { type: SQUAD_LEAVE_PROMPT };
}

// The approach card's Continue: commit to the fight on the tile the squad is standing on. The card closes and
// the assault starts exactly as stepping in used to start it (contact beat, then the arena).
export function squadEngage() {
    return function(dispatch: Dispatch, getState: GetState) {
        const planet = getState().planet;
        const prompt = planet.prompt;
        if (!planet.squad || !prompt || prompt.phase !== 'approach') return false;
        dispatch({ type: SQUAD_LEAVE_PROMPT });
        return dispatch(squadAttack(prompt.poiId, prompt.fromCoord || planet.squad.coord));
    }
}

// The approach card's Leave: think better of it and step back off the site the way the squad came. Not offered
// on a concealed site (the fight is already sprung), so the thunk refuses too.
export function squadLeaveApproach() {
    return function(dispatch: Dispatch, getState: GetState) {
        const planet = getState().planet;
        const prompt = planet.prompt;
        if (!planet.squad || !prompt || prompt.phase !== 'approach') return false;
        const poi = planet.pois[prompt.poiId];
        if (poi && poi.concealed) return false;
        dispatch({ type: SQUAD_LEAVE_PROMPT });
        if (prompt.fromCoord) dispatch(squadStep(prompt.fromCoord));
        return true;
    }
}

// Walking onto an uncleared settlement starts the fight: a live per-unit battle (lib/battle.ts) against the settlement's
// current garrison, played out in the encounter popup. `fromCoord` is the tile the squad stepped in from,
// held for the duration so a retreat can walk back out the way it came. `level` picks which of the settlement's
// fights this is: 0 on entry, deeper via squadDescend.
export function squadAttack(poiId: string, fromCoord: Coord, level = 0) {
    return function(dispatch: Dispatch, getState: GetState) {
        const planet = getState().planet;
        const squad = planet.squad;
        const poi = planet.pois[poiId];

        if (!squad || squad.fighting) return false;
        if (!poi || poi.status === 'cleared') return false;
        if (poi.requires && !planet.unlockedTerrains[poi.requires]) {
            dispatch(logInline(sealedText(poi)));
            return false;
        }
        // Must be standing ON it -- this fires from the arrival event, not from an adjacent tile
        if (squad.coord[0] !== poi.coord[0] || squad.coord[1] !== poi.coord[1]) return false;

        const poiLevel = poiLevels(poi)[level];
        if (!poiLevel) return false;

        // Garrison composition: a level may declare a typed mix (garrison), a spawn formation, and an
        // obstacle layout (terrain); plain levels field `difficulty` standard defenders in a column front on open
        // ground. The squad fights with its deploy-time stat snapshot. The terrain salt derives from the
        // settlement's map coord and the level, so every assault on this level fights on the same ground.
        dispatch({ type: SQUAD_START_FIGHT,
            payload: { poiId, fromCoord, level, battle: createBattle(
                squad.droidHp || squad.squadSize,
                poiLevel.garrison || poiLevel.difficulty || 0,
                squad.droidStats || undefined,
                poiLevel.formation || undefined,
                poiLevel.terrain || undefined,
                poi.coord[0] * 337 + poi.coord[1] + level * 7919) } });
        return true;
    }
}

// Between a settlement's levels (the result phase offering the descent): go down. The next fight starts on the spot
// with whatever hull and charges the last one left.
export function squadDescend() {
    return function(dispatch: Dispatch, getState: GetState) {
        const prompt = getState().planet.prompt;
        if (!prompt || prompt.phase !== 'result' || !prompt.result || prompt.result.nextLevel == null) return false;
        const squad = getState().planet.squad;
        if (!squad) return false;

        return dispatch(squadAttack(prompt.poiId, prompt.fromCoord || squad.coord, prompt.result.nextLevel));
    }
}

// Between a settlement's levels: take what was won and go. Unlike a retreat nobody is shooting, so it costs nothing
// but the step back out; the site re-mans itself from the top behind the squad.
export function squadWithdraw() {
    return function(dispatch: Dispatch, getState: GetState) {
        const planet = getState().planet;
        const prompt = planet.prompt;
        if (!prompt || prompt.phase !== 'result' || !prompt.result || prompt.result.nextLevel == null) return false;

        const poi = planet.pois[prompt.poiId];
        dispatch({ type: SQUAD_LEAVE_PROMPT });
        if (poi) dispatch(logInline(TELEMETRY.teamWithdrew(poi.name, prompt.result.nextLevel)));
        if (prompt.fromCoord) dispatch(squadStep(prompt.fromCoord));
        return true;
    }
}

// Emerging from a tunnel (fought through, or crossed): the far mouth is a tile arrived at, so the squad
// looks around from it the way any step reveals ground (advanceSquad does this per tile walked; a teleport
// skips that, and the far side would otherwise sit unexplored around the squad).
function revealFromSquad(dispatch: Dispatch, getState: GetState) {
    const planet = getState().planet;
    const squad = planet.squad;
    if (!squad) return;
    const reveals = getVisibleCoords(planet.map, squad.coord)
        .filter(([r, c]) => planet.map[r][c].status === STATUSES.unknown.key);
    if (reveals.length === 0) return;
    const revealedFlatland = reveals.filter(
        ([r, c]) => planet.map[r][c].terrain === TERRAINS.flatland.key && !planet.map[r][c].heldBy
    ).length;
    dispatch({ type: ADVANCE_SQUAD, payload: { squad, reveals, revealedFlatland } });
    if (revealedFlatland > 0) dispatch(recalculateState());
}

// Fires a carried equipment piece into the live battle (the popup's action row / number hotkeys).
export function useEquipment(itemId: EquipmentId) {
    return function(dispatch: Dispatch, getState: GetState) {
        const squad = getState().planet.squad;
        if (!squad || !squad.fighting) return false;
        if (!squad.equipment || !((squad.equipment[itemId] ?? 0) > 0)) return false;

        dispatch({ type: SQUAD_USE_EQUIPMENT, payload: { itemId } });
        return true;
    }
}

// Orders a fighting squad to fall back (Esc). Droids stop attacking and run for the field edge while hostiles
// keep swinging, so the cost is emergent: fleeing at first contact is nearly free, mid-rout is not.
export function retreatFromFight() {
    return function(dispatch: Dispatch, getState: GetState) {
        const squad = getState().planet.squad;
        if (!squad || !squad.fighting) return false;
        if (squad.fighting.battle.phase === 'withdrawing') return false;

        dispatch({ type: SQUAD_RETREAT_ORDERED });
        return true;
    }
}

// Applies advanceSquad's contact/fight events (dispatched from planetTick).
function resolveSquadEvent(dispatch: Dispatch, getState: GetState, squad: Squad | null, event: SquadEvent) {
    const pois = getState().planet.pois;

    switch (event.type) {
        case 'battleOver': {
            if (!squad) break; // a fight can only end with the squad still fielded (see advanceSquad)
            const poi = pois[event.poiId];

            const levels = poiLevels(poi);
            if (event.result === 'won' && event.level < levels.length - 1) {
                // More beneath: the site stands. Loot loads and the popup turns into the descend-or-withdraw
                // choice (see SQUAD_LEVEL_WON); the level count stays unknown unless the site announces it.
                const reward = levelPayout(poi, event.level);
                dispatch({ type: SQUAD_LEVEL_WON, payload: { poiId: event.poiId, level: event.level,
                    survivors: event.survivors, droidHp: event.droidHp, reward,
                    fromCoord: event.fromCoord,
                    result: {
                        losses: squad.squadSize - event.survivors,
                        squadSize: squad.squadSize,
                        multiplier: squad.multiplier || 1,
                        capability: reward.capability || null,
                        loaded: reward.resources || null,
                        level: event.level,
                        levelsTotal: poi.levelsShown ? levels.length : null,
                        nextLevel: event.level + 1,
                        finalBattle: event.battle
                    } } });
                if (reward.capability) {
                    dispatch(unlockTerrain(reward.capability));
                }
            }
            else if (event.result === 'won') {
                const reward = levelPayout(poi, event.level);

                // Reclaimed land: the stamp's already-revealed flatland credits NOW (counted before the reducer
                // retracts the flags); still-unknown stamp tiles credit later through the normal reveal path.
                let landCredit = 0;
                if (poi.territoryRadius != null) {
                    const planetMap = getState().planet.map;
                    [poi.coord, ...getCoordsWithinHops(poi.coord, poi.territoryRadius)].forEach(([r, c]) => {
                        const sector = planetMap[r][c];
                        if (sector.heldBy === event.poiId && sector.status === STATUSES.explored.key &&
                            sector.terrain === TERRAINS.flatland.key) {
                            landCredit++;
                        }
                    });
                }

                // The outcome narrates in the popup's result phase (the squad is standing right there),
                // over the battle's final frame (finalBattle: the popup holds the field instead of
                // snapping down to the small prompt). Counts are effective units; the popup words them
                // "units" once replication multiplies.
                dispatch({ type: SQUAD_FIGHT_WON, payload: { poiId: event.poiId, survivors: event.survivors,
                    droidHp: event.droidHp, reward, landCredit,
                    result: {
                        losses: squad.squadSize - event.survivors,
                        squadSize: squad.squadSize,
                        multiplier: squad.multiplier || 1,
                        landCredit,
                        capability: (reward && reward.capability) || null,
                        loaded: (reward && reward.resources) || null,
                        level: event.level,
                        levelsTotal: levels.length, // the bottom is reached: the count is known now
                        finalBattle: event.battle
                    } } });
                // The site has fallen: the classifier's one line on what else was in there
                if (poi.discardedKg) {
                    dispatch(logInline(TELEMETRY.organicDiscarded(poi.discardedKg)));
                }
                if (reward && reward.capability) {
                    dispatch(unlockTerrain(reward.capability));
                }
                if (poi.type === 'tunnel') revealFromSquad(dispatch, getState); // it came out the far mouth
                if (poi.site != null) {
                    dispatch(logInline(TELEMETRY.siteSecured(poi.site)));
                    // The ground under the squad just became powered: it gets what a step onto the grid gives
                    // (refill, repair, reload, cargo banked) without having to step off and back on
                    const standing = getState().planet.squad;
                    if (standing) {
                        dispatch({ type: ADVANCE_SQUAD, payload: { squad: { ...standing, ...restoredOnGrid(standing) },
                            reveals: [], revealedFlatland: 0 } });
                        resolveSquadEvent(dispatch, getState, standing, { type: 'onGrid' });
                    }
                }
            }
            else if (event.result === 'wiped') {
                // The player watched it happen; the popup holds the ending (planet-level prompt, no squad
                // left to anchor it), and the terminal keeps a line for the record.
                const cargoLost = squad.cargo && Object.keys(squad.cargo).length > 0 ? squad.cargo : null;
                dispatch({ type: SQUAD_WIPED, payload: { poiId: event.poiId,
                    result: { wiped: true, squadSize: squad.squadSize,
                        multiplier: squad.multiplier || 1, cargoLost,
                        finalBattle: event.battle } } });
                dispatch(logInline(TELEMETRY.teamLost(poi.name, poi.type === 'tunnel', cargoLost ? formatResourceList(cargoLost) : null)));
            }
            else { // retreated
                dispatch({ type: SQUAD_RETREATED, payload: { poiId: event.poiId, survivors: event.survivors,
                    droidHp: event.droidHp } });
                dispatch(logInline(TELEMETRY.teamFellBack(poi.name, event.survivors, squad.squadSize, unitNoun(squad.multiplier || 1))));
                // Falling back is a real move off the settlement tile, animated and paid for like any other step
                // (a failed assault costs a tile of battery each way). Saves written before fromCoord existed
                // have none, in which case the squad just holds the ground it took.
                if (event.fromCoord) dispatch(squadStep(event.fromCoord));
            }
            dispatch(recalculateState());
            break;
        }
        case 'enteredPoi': {
            const entered = pois[event.poiId];
            if (entered && entered.status === 'hidden') {
                // Concealed and just stepped on (a camp, a field event): found. It shows from here on, and a
                // fight or prompt follows like any other contact.
                dispatch({ type: REVEAL_POI, payload: { poiId: entered.id } });
            }
            if (entered && isGarrisoned(entered)) {
                // Walked onto a garrisoned site: the approach card comes up (what is ahead, the threat estimate)
                // and the fight starts on Continue, here on the tile; Leave walks back to event.fromCoord. A
                // concealed site was sprung: its card holds through the contact beat while the map plays the
                // glyph blinking on the tile, and offers no Leave.
                dispatch({ type: SQUAD_PROMPT, payload: { poiId: event.poiId, phase: 'approach', fromCoord: event.fromCoord,
                    ...(entered.concealed ? { sprungAt: getState().clock.elapsedTime } : {}) } });
                break;
            }
            if (entered && entered.type === 'tunnel' && entered.exitCoord) {
                // An open tunnel: stepping into the mouth IS the crossing, no prompt. Paid in battery as so many
                // tiles walked (never hull: the passage is the shortcut the squad already fought for); the
                // follow-cam recenters on the far mouth next tick. Arriving there raises nothing (the teleport
                // is not a step), so the squad walks off the far mouth freely.
                const current = getState().planet.squad;
                if (!current) break;
                dispatch({ type: SQUAD_CROSS_TUNNEL, payload: { poiId: entered.id, exitCoord: entered.exitCoord,
                    cost: (entered.crossTiles || 0) * squadDrainPerTile() } });
                revealFromSquad(dispatch, getState);
                dispatch(logInline(TELEMETRY.teamCrossed(entered.name)));
                break;
            }
            // Walked onto a cache/story tile: movement stops and the interaction prompt opens (the player
            // chooses to take/explore via squadInteract, or leaves via squadLeavePrompt)
            dispatch({ type: SQUAD_PROMPT, payload: { poiId: event.poiId } });
            break;
        }
        case 'fieldWiped': {
            // Overextension death: battery spent, then the hull overdraft too. advanceSquad already
            // returned a null squad (applied via ADVANCE_SQUAD), so there's nothing to delete -- no popup
            // either (no site to anchor one; the map showed the squad go dark); the terminal keeps the record.
            const cargoLost = event.cargoLost && Object.keys(event.cargoLost).length > 0 ? event.cargoLost : null;
            dispatch(logInline(TELEMETRY.teamLostInField(event.unitsLost, unitNoun(event.multiplier), cargoLost ? formatResourceList(cargoLost) : null)));
            dispatch(recalculateState());
            break;
        }
        case 'enteredZone': {
            // Crossed into different ground: a one-line note in the zone's color, not repeated for a zone the
            // terminal noted recently (TERRAIN_BLURBS in database/planet/terrain.ts)
            const now = getState().clock.elapsedTime;
            const zone: SquadZone = event.zone;
            const blurb = TERRAIN_BLURBS[zone];
            if (blurb && !(now - (lastBlurbAt[zone] || -Infinity) < TERRAIN_BLURB_REPEAT_MS)) {
                lastBlurbAt[zone] = now;
                dispatch(logInline(blurb, 'terrain-blurb', { color: zoneColor(zone) }));
            }
            break;
        }
        case 'onGrid': {
            // Touched powered ground: bank any cargo
            const current = getState().planet.squad;
            if (current && current.cargo && Object.keys(current.cargo).length > 0) {
                dispatch({ type: SQUAD_DELIVER_CARGO, payload: { cargo: current.cargo } });
                dispatch(logInline(TELEMETRY.cargoBanked(formatResourceList(current.cargo))));
                dispatch(recalculateState());
            }
            break;
        }
    }
}

// Standard functions

export function percentExplored(state: PlanetState) {
    return state.numExplored / NUM_SECTORS * 100;
}

// Advances every droid one tick. Scouts are grid remotes with a lifecycle:
//   docked (no coord, invisible)  --work exists-->  surface on the grid tile nearest an unclaimed lookout
//   active                        --sweep + walk, revealing line-of-sight per tile arrived at
//   nothing left to sweep         --docking-->      walk to the nearest powered tile, fold back into docked
//   unassigned (returning)        --walk to the nearest powered tile, despawn into the idle pool on arrival
//     (counted in numArrivedHome; the resources reducer credits the pool from it)
// Targeting is bounded to `halo`, the scouts' sweep area (see getGridHalo).
// Pure: reads `map` but never mutates it -- returns the new droid array plus the list of newly-revealed coords.
function advanceDroids(map: PlanetMap, droids: ScoutDroid[], moveAmount: number, unlocks: Unlocks, allowRetarget: boolean, halo: Set<string> | null = null) {
    const reveals = new Set<string>();
    const isRevealed = (row: number, col: number) => map[row][col].status !== STATUSES.unknown.key || reveals.has(`${row},${col}`);
    const reveal = (row: number, col: number) => {
        if (map[row][col].status === STATUSES.unknown.key) reveals.add(`${row},${col}`);
    };
    // Line-of-sight from a tile a droid is standing on: reveal it and everything within SCOUT_VISION_HOPS
    // (mountains show up as walls and hide what is behind them, as for the squad).
    const revealFrom = (origin: Coord) => {
        reveal(origin[0], origin[1]);
        getVisibleCoords(map, origin, SCOUT_VISION_HOPS).forEach(([r, c]) => reveal(r, c));
    };
    // A lookout target is only worth heading to while it would still reveal an IN-HALO unknown tile.
    const isUsefulLookout = (coord: Coord) => getVisibleCoords(map, coord, SCOUT_VISION_HOPS)
        .some(([r, c]) => !isRevealed(r, c) && (!halo || halo.has(`${r},${c}`)));
    // Targets currently spoken for, so two droids don't walk to the same tile.
    const claimed = new Set(droids.map(d => d.target).filter((t): t is Coord => !!t).map(t => `${t[0]},${t[1]}`));
    const claim = (target: Coord) => claimed.add(`${target[0]},${target[1]}`);

    const dockedDroid = () => ({ docked: true, coord: null, path: [], target: null, moveProgress: 0, heading: null });

    // Walk a returning/docking droid's path over known ground (no reveals); returns the moved fields.
    const walkPath = (droid: ScoutDroid) => {
        let coord = droid.coord;
        let path = droid.path ? droid.path.slice() : [];
        let moveProgress = (droid.moveProgress || 0) + moveAmount;

        while (path.length > 0) {
            const next = path[0];
            const tileCrossMs = getCrossTime(map[next[0]][next[1]].terrain, unlocks) * 1000;
            if (moveProgress < tileCrossMs) break;
            moveProgress -= tileCrossMs;
            coord = next;
            path = path.slice(1);
        }

        return { coord, path, moveProgress };
    };

    let numArrivedHome = 0;

    const nextDroids: ScoutDroid[] = [];
    droids.forEach(droid => {
        // Docked scouts live in the grid. When there's work, one surfaces on the powered tile nearest an
        // unclaimed lookout (the base is replicated across all developed land, so every powered tile is a
        // deploy point) and sweeps from there. Coordless legacy droids are treated as docked.
        if (droid.docked || !droid.coord) {
            if (allowRetarget) {
                const result = findNearestLookoutFromGrid(map, { claimed, unlocks, halo });
                if (result) {
                    const [emergence, ...path] = result.path;
                    claim(result.target);
                    revealFrom(emergence); // line-of-sight from where it surfaced
                    nextDroids.push({ coord: emergence, path, target: result.target, moveProgress: 0, heading: result.heading });
                    return;
                }
            }
            nextDroids.push(droid.docked ? droid : dockedDroid());
            return;
        }

        // A docking scout is still assigned: if work reappeared (the halo grew), re-task it where it stands.
        if (droid.docking && allowRetarget) {
            const result = findNearestLookout(map, droid.coord, { claimed, unlocks, heading: droid.heading, halo });
            if (result) {
                claim(result.target);
                nextDroids.push({ coord: droid.coord, path: result.path, target: result.target, moveProgress: 0, heading: result.heading });
                return;
            }
        }

        // Walkers heading for the grid: recalled scouts despawn into the idle pool on arrival; docking
        // scouts fold back into the docked state (still assigned).
        if (droid.returning || droid.docking) {
            const { coord, path, moveProgress } = walkPath(droid);

            if (path.length === 0) {
                if (droid.returning) {
                    numArrivedHome++;
                    return;
                }
                nextDroids.push(dockedDroid());
                return;
            }

            nextDroids.push({ ...droid, coord, path, moveProgress });
            return;
        }

        let coord = droid.coord;
        let path = droid.path ? droid.path.slice() : [];
        let target = droid.target;
        let moveProgress = (droid.moveProgress || 0) + moveAmount;
        let heading = droid.heading || null;

        // Drop the target lookout once its unknown has been revealed (by us or another droid), then re-target.
        if (target && !isUsefulLookout(target)) {
            claimed.delete(`${target[0]},${target[1]}`);
            target = null;
            path = [];
        }

        // Acquire a target when idle, following the droid's heading so it holds a course. When there's no
        // work to acquire (sweep complete, or nothing reachable), head for the nearest powered tile and dock.
        if (path.length === 0) {
            const result = allowRetarget ? findNearestLookout(map, coord, { claimed, unlocks, heading, halo }) : null;
            if (result) {
                target = result.target;
                path = result.path;
                heading = result.heading;
                claim(target);
            }
            else {
                const dockPath = findPathToGrid(map, coord, { unlocks });
                if (dockPath === null) {
                    // The grid is unreachable from here (walled off): hold position
                    nextDroids.push({ coord, path: [], target: null, moveProgress: 0, heading });
                }
                else if (dockPath.length === 0) {
                    nextDroids.push(dockedDroid()); // already standing on powered ground
                }
                else {
                    nextDroids.push({ coord, path: dockPath, target: null, moveProgress: 0, heading: null, docking: true });
                }
                return;
            }
        }

        // Walk the path, spending one tile's crossTime per step; reveal each tile's neighbors on arrival.
        while (path.length > 0) {
            const next = path[0];
            const tileCrossMs = getCrossTime(map[next[0]][next[1]].terrain, unlocks) * 1000;
            if (moveProgress < tileCrossMs) break;
            moveProgress -= tileCrossMs;
            coord = next;
            path = path.slice(1);
            revealFrom(coord);
        }

        // Reached the target (path emptied): release the claim and re-target next tick.
        if (path.length === 0 && target) {
            claimed.delete(`${target[0]},${target[1]}`);
            target = null;
        }

        nextDroids.push({ coord, path, target, moveProgress, heading });
    });

    return {
        droids: nextDroids,
        reveals: Array.from(reveals).map(parseCoordKey),
        numArrivedHome
    };
}
