import update from 'immutability-helper';
import {recalculateState, withRecalculation} from "../reducer";
import {
    COOK_TIME,
    generateRandomMap,
    getCrossTime,
    getCurrentDevelopmentArea,
    getHomeBasePosition,
    getNextDevelopmentArea,
    NUM_SECTORS,
    numSectorsMatching,
    STATUSES, sunTrackingRotation,
    TERRAINS
} from "../../lib/planet_map";
import {getAdjacentCoords} from "../../lib/planet_geometry";
import {findNearestLookout, findPath, isExplorationComplete} from "../../lib/planet_pathing";
import {
    advanceSquad,
    buildReportText,
    computeOutcome,
    FIGHT_DURATION_MS,
    generateDebugPois,
    POI_STATUS,
    SQUAD_STATUS
} from "../../lib/expeditions";
import {canConsume} from "./resources";
import {logInline} from "./log";
import {batch} from "react-redux";
import * as fromClock from "./clock";

// Actions
export const GENERATE_MAP = 'planet/GENERATE_MAP';
export const PROGRESS = 'planet/PROGRESS';
export const FINISH_EXPLORING_MAP = 'planet/FINISH_EXPLORING_MAP';
export const SET_ROTATION = 'planet/SET_ROTATION';
export const SET_SUN_TRACKING = 'planet/SET_SUN_TRACKING';
export const ASSIGN_DROID = 'planet/ASSIGN_DROID';
export const REMOVE_DROID = 'planet/REMOVE_DROID';
export const START_DEVELOPMENT = 'planet/START_DEVELOPMENT';
export const FINISH_DEVELOPMENT = 'planet/FINISH_DEVELOPMENT';
export const SET_EXPLORE_SPEED = 'planet/SET_EXPLORE_SPEED';
export const UNLOCK_TERRAIN = 'planet/UNLOCK_TERRAIN';
export const START_COOK = 'planet/START_COOK';
export const INCREMENT_COOK = 'planet/INCREMENT_COOK';

export const DISPATCH_SQUAD = 'planet/DISPATCH_SQUAD';
export const MOVE_SQUAD = 'planet/MOVE_SQUAD';
export const ENGAGE_FIGHT = 'planet/ENGAGE_FIGHT';
export const RECALL_SQUAD = 'planet/RECALL_SQUAD';
export const ADVANCE_SQUAD = 'planet/ADVANCE_SQUAD';
export const RESOLVE_AT_POI = 'planet/RESOLVE_AT_POI';
export const SQUAD_HOME = 'planet/SQUAD_HOME';

const OVERALL_MAP_STATUS = {
    unstarted: 'unstarted',
    inProgress: 'inProgress',
    finished: 'finished',
}

// Initial State
const initialState = {
    map: [],
    homeCoord: null, // [row, col] of the command center; droids spawn here
    overallStatus: OVERALL_MAP_STATUS.unstarted,
    rotation: 0.5,
    sunTracking: false, // TODO need to fix twilight shading if going to use this
    droidData: { // This object mirrors 'structure' format so they can be polymorphic
        numDroidsAssigned: 0,
        droidAssignmentType: 'planet'
    },
    // One entity per assigned droid: { coord: [row,col], path: [[row,col],...], target: [row,col]|null, moveProgress: ms }
    // Kept in lockstep with droidData.numDroidsAssigned (assign spawns at home, remove despawns).
    droids: [],
    unlockedTerrains: {}, // e.g. { mountaineering: true } once researched; gates which terrain droids can cross
    exploreSpeed: 1,
    cookedPct: 0, // How much of the entire planet is on fire :P

    // Cached counts (cheaper than scanning the map each render). TODO use reselect instead?
    numExplored: 0, // Number of revealed sectors
    maxDevelopedLand: 0,

    // Expedition system (see lib/expeditions.js for domain logic and shapes). Reports go to the terminal
    // (log.logInline), not planet state.
    pois: {},     // by poiId; seeded at GENERATE_MAP, discovered (hidden -> available) as scouting reveals their tiles
    squad: null   // the single squad: { squadSize, status, coord, path, moveProgress, targetPoiId, atPoiId,
                  //                     pendingFight, fightRemaining, outcome, recalled }
}

// Reducer
export default function reducer(state = initialState, action) {
    const payload = action.payload;
    let updates;

    switch (action.type) {
        case GENERATE_MAP:
            return update(state, {
                map: { $set: payload.map },
                homeCoord: { $set: payload.homeCoord },
                numExplored: { $set: numSectorsMatching(payload.map, STATUSES.explored.enum) },
                maxDevelopedLand: { $set: numSectorsMatching(payload.map, undefined, TERRAINS.flatland.enum) + 1 }, // add 1 for home base
                pois: { $set: payload.pois },
                squad: { $set: null }
            })
        case PROGRESS:
            updates = {
                droids: { $set: payload.droids }
            }

            if (payload.newRotation) {
                updates.rotation = { $set: payload.newRotation };
            }

            // Apply the tiles revealed by droid movement this tick (line-of-sight): mark them explored and bump the count.
            if (payload.reveals.length > 0) {
                updates.map = {};
                payload.reveals.forEach(([rowIndex, colIndex]) => {
                    if (updates.map[rowIndex] === undefined) updates.map[rowIndex] = {};
                    updates.map[rowIndex][colIndex] = { status: { $set: STATUSES.explored.enum } };
                });
                updates.numExplored = { $apply: x => x + payload.reveals.length };
                updates.overallStatus = { $set: OVERALL_MAP_STATUS.inProgress };

                // POI discovery: a hidden POI whose tile just got revealed becomes available (shows on map + sidebar)
                const revealKeys = new Set(payload.reveals.map(([r, c]) => `${r},${c}`));
                Object.values(state.pois).forEach(poi => {
                    if (poi.status === POI_STATUS.hidden && revealKeys.has(`${poi.coord[0]},${poi.coord[1]}`)) {
                        if (updates.pois === undefined) updates.pois = {};
                        updates.pois[poi.id] = { status: { $set: POI_STATUS.available } };
                    }
                });
            }

            return update(state, updates);
        case FINISH_EXPLORING_MAP:
            return update(state, {
                overallStatus: { $set: OVERALL_MAP_STATUS.finished },
            })
        case SET_ROTATION:
            return update(state, {
                rotation: { $set: payload.value }
            })
        case SET_SUN_TRACKING:
            return update(state, {
                sunTracking: { $set: payload.value }
            })
        case ASSIGN_DROID: {
            // payload.amount fresh droids spawn at home base; payload.turnAroundIndices are returning droids that
            // turn around in place (recall undone) and resume exploring from wherever they stand next tick.
            const turnAroundSet = new Set(payload.turnAroundIndices || []);
            const spawned = [];
            for (let i = 0; i < payload.amount; i++) {
                spawned.push({ coord: state.homeCoord, path: [], target: null, moveProgress: 0, heading: null });
            }
            return update(state, {
                droidData: { numDroidsAssigned: { $apply: (x) => x + payload.amount + turnAroundSet.size } },
                droids: {
                    $apply: (droids) => droids
                        .map((droid, i) => turnAroundSet.has(i) ?
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
            const recallByIndex = {};
            payload.recalls.forEach(recall => { recallByIndex[recall.index] = recall; });
            const instantSet = new Set(payload.instantIndices);
            const numRemoved = payload.recalls.length + payload.instantIndices.length;

            return update(state, {
                droidData: { numDroidsAssigned: { $apply: (x) => x - numRemoved } },
                droids: {
                    $apply: (droids) => droids
                        .map((droid, i) => recallByIndex[i] ?
                            { ...droid, returning: true, target: null, heading: null, path: recallByIndex[i].path, moveProgress: 0 } :
                            droid)
                        .filter((droid, i) => !instantSet.has(i))
                }
            });
        }
        case START_DEVELOPMENT:
            updates = { map: {} }
            payload.coords.forEach(coord => {
                if (updates.map[coord[0]] === undefined) { updates.map[coord[0]] = {} }
                updates.map[coord[0]][coord[1]] = {
                    terrain: { $set: TERRAINS.developing.enum }
                }
            })
            return update(state, updates);
        case FINISH_DEVELOPMENT:
            updates = { map: {} }
            payload.coords.forEach(coord => {
                if (updates.map[coord[0]] === undefined) { updates.map[coord[0]] = {} }
                updates.map[coord[0]][coord[1]] = {
                    terrain: { $set: TERRAINS.developed.enum }
                }
            })
            return update(state, updates);
        case SET_EXPLORE_SPEED:
            return update(state, {
                exploreSpeed: { $set: payload.value }
            })
        case UNLOCK_TERRAIN:
            // A terrain-crossing upgrade (e.g. mountaineering) makes that terrain passable, which re-opens frontier.
            // Clear any 'finished' status so planetTick resumes exploring the newly-reachable ground.
            return update(state, {
                unlockedTerrains: { [payload.upgrade]: { $set: true } },
                overallStatus: { $set: OVERALL_MAP_STATUS.inProgress }
            })
        case START_COOK:
            return update(state, {
                cookedPct: { $set: 0.01 }
            })
        case INCREMENT_COOK:
            return update(state, {
                cookedPct: { $apply: x => Math.min(x + (payload.timeDelta / COOK_TIME), 1) }
            })

        case DISPATCH_SQUAD:
            return update(state, {
                squad: {
                    $set: {
                        squadSize: payload.squadSize,
                        status: SQUAD_STATUS.traveling,
                        coord: state.homeCoord,
                        path: payload.path,
                        moveProgress: 0,
                        targetPoiId: payload.targetPoiId,
                        atPoiId: null,
                        pendingFight: false,
                        fightRemaining: null,
                        outcome: null,
                        recalled: false
                    }
                }
            })
        case MOVE_SQUAD:
            // Push on from a held position to another POI; path starts from the squad's current coord
            return update(state, {
                squad: {
                    status: { $set: SQUAD_STATUS.traveling },
                    targetPoiId: { $set: payload.targetPoiId },
                    path: { $set: payload.path },
                    moveProgress: { $set: 0 },
                    atPoiId: { $set: null },
                    pendingFight: { $set: false }
                }
            })
        case ENGAGE_FIGHT:
            // Outcome is decided here, up front; the fighting state is a timed animation over a known result
            return update(state, {
                squad: {
                    status: { $set: SQUAD_STATUS.fighting },
                    pendingFight: { $set: false },
                    fightRemaining: { $set: FIGHT_DURATION_MS },
                    outcome: { $set: payload.outcome }
                }
            })
        case RECALL_SQUAD:
            return update(state, {
                squad: {
                    status: { $set: SQUAD_STATUS.returning },
                    path: { $set: payload.path },
                    moveProgress: { $set: 0 },
                    targetPoiId: { $set: null },
                    atPoiId: { $set: null },
                    pendingFight: { $set: false },
                    recalled: { $set: true }
                }
            })
        case ADVANCE_SQUAD:
            // Wholesale snapshot from the pure advanceSquad (movement + fight countdown + arrival transitions)
            return update(state, {
                squad: { $set: payload.squad }
            })
        case RESOLVE_AT_POI:
            updates = {}

            if (payload.outcome.success) {
                updates.pois = { [payload.poiId]: { status: { $set: POI_STATUS.cleared } } };
            }
            else {
                // Failed assault: the exact strength is now known for the retry
                updates.pois = { [payload.poiId]: { difficultyKnown: { $set: true } } };
            }

            if (payload.outcome.survivors > 0) {
                // Survivors hold at the site awaiting orders (push on or recall)
                updates.squad = {
                    status: { $set: SQUAD_STATUS.holding },
                    squadSize: { $set: payload.outcome.survivors },
                    pendingFight: { $set: false },
                    fightRemaining: { $set: null },
                    outcome: { $set: null }
                };
            }
            else {
                updates.squad = { $set: null }; // squad wiped; nothing walks home
            }

            return update(state, updates);
        case SQUAD_HOME:
            return update(state, {
                squad: { $set: null }
            });
        default:
            return state;
    }
}


// Action Creators
export function setRotation(value) {
    return { type: SET_ROTATION, payload: { value } }
}
export function setSunTracking(value) {
    return { type: SET_SUN_TRACKING, payload: { value } }
}
export function startCooking() {
    return { type: START_COOK }
}

export function generateMap() {
    const map = generateRandomMap();
    const homeCoord = getHomeBasePosition(map).coord;
    const pois = generateDebugPois(map);
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
                const distance = ({ droid }) => droid.coord ? planet.map[droid.coord[0]][droid.coord[1]].graphDistanceHome : 0;
                return distance(b) - distance(a);
            })
            .slice(0, amount)
            .map(({ index }) => index);

        dispatch({ type: ASSIGN_DROID, payload: { amount: amount - turnAroundIndices.length, turnAroundIndices } });
    });
}

// Removing scout droids recalls them: nearest-home first, each walking back before rejoining the idle pool.
// The thunk picks the droids and computes their return paths; the reducer applies flags and despawns instants.
export function removeDroidUnsafe(amount = 1) {
    return withRecalculation(function(dispatch, getState) {
        const planet = getState().planet;

        // Only active (non-returning) droids are eligible; recall the ones closest to home first
        const candidates = planet.droids
            .map((droid, index) => ({ droid, index }))
            .filter(({ droid }) => !droid.returning)
            .sort((a, b) => {
                const distance = ({ droid }) => droid.coord ? planet.map[droid.coord[0]][droid.coord[1]].graphDistanceHome : -1;
                return distance(a) - distance(b);
            })
            .slice(0, amount);

        const recalls = [];
        const instantIndices = [];
        candidates.forEach(({ droid, index }) => {
            const atHome = droid.coord && planet.homeCoord &&
                droid.coord[0] === planet.homeCoord[0] && droid.coord[1] === planet.homeCoord[1];
            const path = (!droid.coord || atHome) ? null :
                findPath(planet.map, droid.coord, planet.homeCoord, { unlocks: planet.unlockedTerrains });

            if (path && path.length > 0) {
                recalls.push({ index, path });
            }
            else {
                instantIndices.push(index); // unplaced, already home, or unroutable: despawn + credit immediately
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

function finishExploringMap() {
    return { type: FINISH_EXPLORING_MAP, payload: {} };
}

export function startDevelopment(dispatch, getState, size) {
    const coords = getNextDevelopmentArea(getState().planet.map, size);
    dispatch({ type: START_DEVELOPMENT, payload: { coords } })
    dispatch(recalculateState());
}
export function finishDevelopment(dispatch, getState) {
    const coords = getCurrentDevelopmentArea(getState().planet.map);
    dispatch({ type: FINISH_DEVELOPMENT, payload: { coords } });
    dispatch(recalculateState());
}

export function setExploreSpeed(value) {
    return { type: SET_EXPLORE_SPEED, payload: { value } }
}

// Marks a terrain-crossing upgrade as researched (e.g. 'mountaineering'), making that terrain passable and resuming
// exploration. Call this from the upgrade's onFinish; `upgrade` must match the terrain's `crossUpgrade` key.
export function unlockTerrain(upgrade) {
    return { type: UNLOCK_TERRAIN, payload: { upgrade } };
}

export function planetTick(timeDelta) {
    return (dispatch, getState) => {
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
            if (state.sunTracking) {
                newRotation = sunTrackingRotation(fromClock.fractionOfDay(getState().clock));
            }

            // Advance the expedition squad (movement / fight countdown). This must run BEFORE the finished-map
            // early-return below, or expeditions would freeze once the map is fully explored.
            if (state.squad) {
                const { squad, events } = advanceSquad(
                    state.map, state.pois, state.squad, timeDelta * state.exploreSpeed, state.unlockedTerrains
                );
                dispatch({ type: ADVANCE_SQUAD, payload: { squad } });

                events.forEach(event => {
                    switch (event.type) {
                        case 'arrived': // cache/story: auto-resolve on arrival
                        case 'fightOver': {
                            const poi = getState().planet.pois[event.poiId];
                            const outcome = event.type === 'arrived' ? computeOutcome(poi, squad.squadSize) : event.outcome;
                            resolveAtPoi(dispatch, getState, event.poiId, outcome);
                            break;
                        }
                        case 'home': {
                            dispatch({ type: SQUAD_HOME, payload: { survivors: event.survivors } });
                            logReport(dispatch, null, 'returned', { survivors: event.survivors });
                            dispatch(recalculateState());
                            break;
                        }
                    }
                });
            }

            const finished = state.overallStatus === OVERALL_MAP_STATUS.finished;
            const anyReturning = state.droids.some(droid => droid.returning);

            // Once exploration is finished there's nothing to path, so skip the frontier scan + droid work entirely
            // (keeps end-state catch-up after a long tab-away ~free). This is re-armed by ASSIGN_DROID -- and would be by
            // a future terrain-crossing upgrade -- so it never permanently locks out droids that could still do work.
            // Exception: recalled droids still walking home must keep advancing.
            if (finished && !anyReturning) {
                if (newRotation) {
                    dispatch({ type: PROGRESS, payload: { newRotation, droids: state.droids, reveals: [], revealedFlatland: 0, numArrivedHome: 0 } });
                }
                return;
            }

            // Don't bother re-targeting idle droids once there's nothing left to reach (avoids a pathfind per idle droid).
            const complete = finished || isExplorationComplete(state.map, state.unlockedTerrains);

            const { droids, reveals, numArrivedHome } = advanceDroids(
                state.map, state.droids, timeDelta * state.exploreSpeed, state.unlockedTerrains, !complete
            );

            // Newly-revealed flatland becomes buildable land (resources reducer listens for this on PROGRESS).
            const revealedFlatland = reveals.filter(
                ([r, c]) => state.map[r][c].terrain === TERRAINS.flatland.enum
            ).length;

            dispatch({ type: PROGRESS, payload: { newRotation, droids, reveals, revealedFlatland, numArrivedHome } });

            if (complete && !finished) {
                dispatch(finishExploringMap());
            }
        });
    }
}



/**
 * --- Expedition thunks ---
 * Thunks validate; reducers apply. All squad/POI state is serializable, so mid-flight saves resume cleanly.
 */

// Reports go to the terminal as inline log lines: assemble the structured fields, compose the text once
// (buildReportText in lib/expeditions.js), and record it. The className colors the line (see log.scss).
function logReport(dispatch, poi, result, extras = {}) {
    const report = {
        poiType: poi ? poi.type : null,
        poiName: poi ? poi.name : null,
        result, // 'success' | 'failure' | 'returned' | 'noRoute'
        ...extras
    };
    dispatch(logInline(buildReportText(report), `report-${result}`));
}

export function dispatchSquad(targetPoiId, squadSize) {
    return function(dispatch, getState) {
        const state = getState();
        const planet = state.planet;
        const poi = planet.pois[targetPoiId];

        if (planet.squad) return;
        if (!poi || poi.status !== POI_STATUS.available) return;
        if (poi.requires && !planet.unlockedTerrains[poi.requires]) return;
        if (squadSize < 1 || !canConsume(state.resources, { standardDroids: squadSize })) return;

        const path = findPath(planet.map, planet.homeCoord, poi.coord, { unlocks: planet.unlockedTerrains });
        if (!path) {
            logReport(dispatch, poi, 'noRoute');
            return;
        }

        dispatch(withRecalculation({ type: DISPATCH_SQUAD, payload: { targetPoiId, squadSize, path } }));
    }
}

// Push on: send the held squad onward to another POI from its current position.
export function moveSquad(targetPoiId) {
    return function(dispatch, getState) {
        const planet = getState().planet;
        const squad = planet.squad;
        const poi = planet.pois[targetPoiId];

        if (!squad || squad.status !== SQUAD_STATUS.holding) return;
        if (!poi || poi.status !== POI_STATUS.available || targetPoiId === squad.atPoiId) return;
        if (poi.requires && !planet.unlockedTerrains[poi.requires]) return;

        const path = findPath(planet.map, squad.coord, poi.coord, { unlocks: planet.unlockedTerrains });
        if (!path) {
            logReport(dispatch, poi, 'noRoute');
            return;
        }

        dispatch({ type: MOVE_SQUAD, payload: { targetPoiId, path } });
    }
}

export function engageFight() {
    return function(dispatch, getState) {
        const planet = getState().planet;
        const squad = planet.squad;

        if (!squad || squad.status !== SQUAD_STATUS.holding || !squad.pendingFight) return;
        const poi = planet.pois[squad.atPoiId];
        if (!poi) return;

        dispatch({ type: ENGAGE_FIGHT, payload: { outcome: computeOutcome(poi, squad.squadSize) } });
    }
}

export function recallSquad() {
    return function(dispatch, getState) {
        const planet = getState().planet;
        const squad = planet.squad;

        // Not recallable mid-fight; a pending (un-engaged) fight is fine to walk away from
        if (!squad) return;
        if (squad.status !== SQUAD_STATUS.traveling && squad.status !== SQUAD_STATUS.holding) return;

        const path = findPath(planet.map, squad.coord, planet.homeCoord, { unlocks: planet.unlockedTerrains });
        if (!path) return; // cannot happen in practice (they walked out on explored ground), but never strand state

        dispatch({ type: RECALL_SQUAD, payload: { path } });
    }
}

// Applies an 'arrived' (cache/story auto-resolve) or 'fightOver' event from advanceSquad.
function resolveAtPoi(dispatch, getState, poiId, outcome) {
    const poi = getState().planet.pois[poiId];
    const reward = outcome.success ? poi.reward : null;

    dispatch({ type: RESOLVE_AT_POI, payload: { poiId, outcome, reward } });
    logReport(dispatch, poi, outcome.success ? 'success' : 'failure', {
        squadSize: outcome.survivors + outcome.losses,
        losses: outcome.losses,
        survivors: outcome.survivors,
        reward: reward && reward.resources ? reward.resources : null,
        storyId: outcome.success ? (poi.storyId || null) : null,
        difficulty: poi.difficulty
    });
    dispatch(recalculateState());
}

// Standard functions

export function percentExplored(state) {
    return state.numExplored / NUM_SECTORS * 100;
}

// Advances every droid one tick: spend `moveAmount` ms of travel, stepping along the path (cost per tile = crossTime),
// revealing each arrived-at tile's neighbors (line-of-sight), and re-targeting idle droids toward the nearest lookout.
// Recalled (returning) droids just walk their path home and despawn on arrival (counted in numArrivedHome; the
// resources reducer credits the idle pool from it).
// Pure: reads `map` but never mutates it -- returns the new droid array plus the list of newly-revealed coords.
function advanceDroids(map, droids, moveAmount, unlocks, allowRetarget) {
    const reveals = new Set();
    const isRevealed = (row, col) => map[row][col].status !== STATUSES.unknown.enum || reveals.has(`${row},${col}`);
    const reveal = (row, col) => {
        if (map[row][col].status === STATUSES.unknown.enum) reveals.add(`${row},${col}`);
    };
    // Line-of-sight from a tile a droid is standing on: reveal it and its immediate neighbors (mountains included).
    const revealFrom = (origin) => {
        reveal(origin[0], origin[1]);
        getAdjacentCoords(origin).forEach(([r, c]) => reveal(r, c));
    };
    // A lookout target is only worth heading to while it still has an unknown neighbor left to reveal.
    const isUsefulLookout = (coord) => getAdjacentCoords(coord).some(([r, c]) => !isRevealed(r, c));
    // Targets currently spoken for, so two droids don't walk to the same tile.
    const claimed = new Set(droids.map(d => d.target).filter(Boolean).map(t => `${t[0]},${t[1]}`));

    let numArrivedHome = 0;

    const nextDroids = [];
    droids.forEach(droid => {
        if (!droid.coord) { nextDroids.push(droid); return; } // not yet placed (assigned before a map existed)

        if (droid.returning) {
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

            if (path.length === 0) {
                numArrivedHome++; // reached home base: despawn (not pushed) and rejoin the idle pool
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

        // Acquire a target when idle, following the droid's heading so it holds a course.
        if (path.length === 0 && allowRetarget) {
            const result = findNearestLookout(map, coord, { claimed, unlocks, heading });
            if (result) {
                target = result.target;
                path = result.path;
                heading = result.heading;
                claimed.add(`${target[0]},${target[1]}`);
            } else {
                target = null;
                moveProgress = 0;
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
        reveals: Array.from(reveals).map(key => key.split(',').map(Number)),
        numArrivedHome
    };
}
