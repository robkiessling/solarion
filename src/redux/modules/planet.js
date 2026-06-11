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
import {findNearestLookout, isExplorationComplete} from "../../lib/planet_pathing";
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

export const START_EXPEDITION = 'planet/START_EXPEDITION';
export const STOP_EXPEDITION = 'planet/STOP_EXPEDITION';

const OVERALL_MAP_STATUS = {
    unstarted: 'unstarted',
    inProgress: 'inProgress',
    finished: 'finished',
}

export const EXPEDITION_STATUS = {
    unstarted: 'unstarted',
    exploring: 'exploring',
    inEvent: 'inEvent',
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

    expedition: {
        droidData: { // This object mirrors 'structure' format so they can be polymorphic
            numDroidsAssigned: 0,
            droidAssignmentType: 'planet'
        },
        status: EXPEDITION_STATUS.unstarted,
        backpack: {},
        battery: 0,
        position: null,
    }
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
                maxDevelopedLand: { $set: numSectorsMatching(payload.map, undefined, TERRAINS.flatland.enum) + 1 } // add 1 for home base
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
            // Spawn one droid entity per assigned droid, parked at the home base until the tick gives it a target.
            const spawned = [];
            for (let i = 0; i < payload.amount; i++) {
                spawned.push({ coord: state.homeCoord, path: [], target: null, moveProgress: 0, heading: null });
            }
            return update(state, {
                droidData: { numDroidsAssigned: { $apply: (x) => x + payload.amount } },
                droids: { $push: spawned }
            });
        }
        case REMOVE_DROID:
            return update(state, {
                droidData: { numDroidsAssigned: { $apply: (x) => x - payload.amount } },
                droids: { $apply: (droids) => droids.slice(0, Math.max(0, droids.length - payload.amount)) }
            });
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

        case START_EXPEDITION:
            return update(state, {
                rotation: { $set: payload.startRotation },
                expedition: {
                    status: { $set: EXPEDITION_STATUS.exploring },
                    position: { $set: payload.startCoord }
                }
            })
        case STOP_EXPEDITION:
            return update(state, {
                expedition: {
                    status: { $set: EXPEDITION_STATUS.unstarted },
                }
            })
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
    return { type: GENERATE_MAP, payload: { map, homeCoord } };
}

export function assignDroidUnsafe(amount = 1) {
    return withRecalculation({ type: ASSIGN_DROID, payload: { amount } });
}
export function removeDroidUnsafe(amount = 1) {
    return withRecalculation({ type: REMOVE_DROID, payload: { amount } });
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
            if (state.sunTracking && state.expedition.status === EXPEDITION_STATUS.unstarted) {
                newRotation = sunTrackingRotation(fromClock.fractionOfDay(getState().clock));
            }

            // Once exploration is finished there's nothing to path, so skip the frontier scan + droid work entirely
            // (keeps end-state catch-up after a long tab-away ~free). This is re-armed by ASSIGN_DROID -- and would be by
            // a future terrain-crossing upgrade -- so it never permanently locks out droids that could still do work.
            if (state.overallStatus === OVERALL_MAP_STATUS.finished) {
                if (newRotation) {
                    dispatch({ type: PROGRESS, payload: { newRotation, droids: state.droids, reveals: [], revealedFlatland: 0 } });
                }
                return;
            }

            // Don't bother re-targeting idle droids once there's nothing left to reach (avoids a pathfind per idle droid).
            const complete = isExplorationComplete(state.map, state.unlockedTerrains);

            const { droids, reveals } = advanceDroids(
                state.map, state.droids, timeDelta * state.exploreSpeed, state.unlockedTerrains, !complete
            );

            // Newly-revealed flatland becomes buildable land (resources reducer listens for this on PROGRESS).
            const revealedFlatland = reveals.filter(
                ([r, c]) => state.map[r][c].terrain === TERRAINS.flatland.enum
            ).length;

            dispatch({ type: PROGRESS, payload: { newRotation, droids, reveals, revealedFlatland } });

            if (complete) {
                dispatch(finishExploringMap());
            }
        });
    }
}



export function startExpedition() {
    return function(dispatch, getState) {
        const {coord, rotation} = getHomeBasePosition(getState().planet.map);
        dispatch({ type: START_EXPEDITION, payload: { startCoord: coord, startRotation: rotation } });
    }
}
export function stopExpedition() {
    return { type: STOP_EXPEDITION, payload: {} };
}

// Standard functions

export function percentExplored(state) {
    return state.numExplored / NUM_SECTORS * 100;
}

// Advances every droid one tick: spend `moveAmount` ms of travel, stepping along the path (cost per tile = crossTime),
// revealing each arrived-at tile's neighbors (line-of-sight), and re-targeting idle droids toward the nearest lookout.
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

    const nextDroids = droids.map(droid => {
        if (!droid.coord) return droid; // not yet placed (assigned before a map existed)

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

        return { coord, path, target, moveProgress, heading };
    });

    return {
        droids: nextDroids,
        reveals: Array.from(reveals).map(key => key.split(',').map(Number))
    };
}
