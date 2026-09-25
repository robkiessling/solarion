import update from 'immutability-helper';
import {recalculateState, surveyAutomationUnlocked, withRecalculation} from "../reducer";
import {generatePlanetMap, getCrossTime, getCurrentDevelopmentArea, getGridHalo, getHomeBasePosition, getNextDevelopmentArea, getVisibleCoords, NUM_SECTORS, numSectorsMatching, type PlanetMap} from "../../lib/planet/map";
import type {Capabilities, Capability} from "../../database/planet/capabilities";
import {centeringRotation, COOK_TIME, sunTrackingRotation} from "../../lib/planet/image";
import {SCOUT_VISION_HOPS, STATUSES, SURVEY_HALO_RADIUS, TERRAINS} from "../../database/planet/terrain";
import {parseCoordKey} from "../../lib/planet/geometry";
import {findNearestLookout, findNearestLookoutFromGrid, findPathToGrid, isExplorationComplete} from "../../lib/planet/pathing";
import {generatePois, type Poi} from "../../lib/planet/pois";
import {advanceSquadTick, squadReducer, type EncounterPrompt, type SquadAction} from "./squad";
import {type Squad} from "../../lib/planet/squad";
import {EXPLORE_EVERYTHING} from "../../dev/skips";
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
    /** the tools held (see database/planet/capabilities.ts); gates terrain crossing */
    capabilities: Capabilities;
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
export const GRANT_CAPABILITY = 'planet/GRANT_CAPABILITY' as const;
export const START_COOK = 'planet/START_COOK' as const;
export const INCREMENT_COOK = 'planet/INCREMENT_COOK' as const;

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
    | { type: typeof GRANT_CAPABILITY; payload: { capability: Capability } }
    | { type: typeof START_COOK }
    | { type: typeof INCREMENT_COOK; payload: { timeDelta: number } }
    | SquadAction;

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
    capabilities: {},
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
        case GRANT_CAPABILITY:
            // A tool that crosses new ground (Amphibious Tracks) re-opens the frontier: clear any 'finished' status
            // so planetTick resumes exploring the newly-reachable ground.
            return update(state, {
                capabilities: { [action.payload.capability]: { $set: true } },
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

        default:
            return squadReducer(state, action);
    }
}

// Shared by PROGRESS (scout reveals) and ADVANCE_SQUAD (squad reveals): mutates `updates` to mark the given
// tiles explored, bump numExplored, and flip any hidden POI on a revealed tile to available.
export function addRevealUpdates(state: PlanetState, updates: Record<string, any>, reveals: Coord[]) {
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
                findPathToGrid(planet.map, droid.coord, { capabilities: planet.capabilities }) : null;

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

// The squad gains a tool for good: from an upgrade's onFinish, or salvaged at a POI (reward.capability). Whatever
// the tool gates (a terrain's or a POI's `requires`) opens at once, and exploration resumes.
export function grantCapability(capability: Capability): PlanetAction {
    return { type: GRANT_CAPABILITY, payload: { capability } };
}

// isExplorationComplete scans the whole map, and the tick asks 30 times a second while the answer only changes
// when a tile is revealed (new map object), the halo grows or a capability is gained. Remember the last answer.
let completionMemo: { map: PlanetMap; haloRadius: number; capabilities: unknown; complete: boolean } | null = null;
function explorationComplete(planet: PlanetState, halo: ReturnType<typeof getGridHalo>['halo']): boolean {
    if (completionMemo && completionMemo.map === planet.map && completionMemo.haloRadius === planet.haloRadius &&
        completionMemo.capabilities === planet.capabilities) {
        return completionMemo.complete;
    }
    const complete = isExplorationComplete(planet.map, planet.capabilities, halo);
    completionMemo = { map: planet.map, haloRadius: planet.haloRadius, capabilities: planet.capabilities, complete };
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

            // Advance the squad first, so driving keeps working on a fully-explored map (the finished-map
            // early-return is below) and the scouts see its reveals as already applied
            const planetState = advanceSquadTick(dispatch, getState, state, timeDelta);

            if (state.rotationMode === 'squad') {
                // Follow the squad; with nobody deployed, center home base instead. Computed AFTER the advance
                // so the camera snaps its column in the same tick the squad arrives -- the render-side
                // cameraShift (see components/planet/globe.jsx) returns to 0 at that exact moment, keeping the scroll seamless.
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
                planetState.map, planetState.droids, timeDelta * planetState.exploreSpeed, planetState.capabilities, !complete, halo
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
function advanceDroids(map: PlanetMap, droids: ScoutDroid[], moveAmount: number, capabilities: Capabilities, allowRetarget: boolean, halo: Set<string> | null = null) {
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
            const tileCrossMs = getCrossTime(map[next[0]][next[1]].terrain, capabilities) * 1000;
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
                const result = findNearestLookoutFromGrid(map, { claimed, capabilities, halo });
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
            const result = findNearestLookout(map, droid.coord, { claimed, capabilities, heading: droid.heading, halo });
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
            const result = allowRetarget ? findNearestLookout(map, coord, { claimed, capabilities, heading, halo }) : null;
            if (result) {
                target = result.target;
                path = result.path;
                heading = result.heading;
                claim(target);
            }
            else {
                const dockPath = findPathToGrid(map, coord, { capabilities });
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
            const tileCrossMs = getCrossTime(map[next[0]][next[1]].terrain, capabilities) * 1000;
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
