import update from 'immutability-helper';
import {recalculateState, surveyAutomationUnlocked, withRecalculation} from "../reducer";
import {
    centeringRotation,
    COOK_TIME,
    generateRandomMap,
    getCrossTime,
    getCurrentDevelopmentArea,
    getGridHalo,
    getHomeBasePosition,
    getNextDevelopmentArea,
    isPassable,
    NUM_SECTORS,
    numSectorsMatching,
    STATUSES, sunTrackingRotation,
    SURVEY_HALO_RADIUS,
    TERRAINS
} from "../../lib/planet_map";
import {getAdjacentCoords, getCoordsWithinHops} from "../../lib/planet_geometry";
import {
    findNearestLookout,
    findNearestLookoutFromGrid,
    findPathToGrid,
    isExplorationComplete
} from "../../lib/planet_pathing";
import {
    CAPABILITY_LABELS,
    computeOutcome,
    FIGHT_DURATION_MS,
    formatResourceList,
    generatePois,
    POI_STATUS,
    POI_TYPES,
    resultBehaviorFor
} from "../../lib/expeditions";
import {canConsume} from "./resources";
import {advanceSquad, createSquad, isOnGrid} from "../../lib/squad";
import {logInline} from "./log";
import {batch} from "react-redux";
import * as fromClock from "./clock";

// Actions
export const GENERATE_MAP = 'planet/GENERATE_MAP';
export const PROGRESS = 'planet/PROGRESS';
export const FINISH_EXPLORING_MAP = 'planet/FINISH_EXPLORING_MAP';
export const SET_ROTATION = 'planet/SET_ROTATION';
export const SET_ROTATION_MODE = 'planet/SET_ROTATION_MODE';
export const ASSIGN_DROID = 'planet/ASSIGN_DROID';
export const REMOVE_DROID = 'planet/REMOVE_DROID';
export const START_DEVELOPMENT = 'planet/START_DEVELOPMENT';
export const FINISH_DEVELOPMENT = 'planet/FINISH_DEVELOPMENT';
export const SET_EXPLORE_SPEED = 'planet/SET_EXPLORE_SPEED';
export const SET_BEACON = 'planet/SET_BEACON';
export const UNLOCK_TERRAIN = 'planet/UNLOCK_TERRAIN';
export const START_COOK = 'planet/START_COOK';
export const INCREMENT_COOK = 'planet/INCREMENT_COOK';

// The player-driven squad (see lib/squad.js)
export const DEPLOY_SQUAD = 'planet/DEPLOY_SQUAD';
export const DISBAND_SQUAD = 'planet/DISBAND_SQUAD';
export const SQUAD_SET_PATH = 'planet/SQUAD_SET_PATH';
export const ADVANCE_SQUAD = 'planet/ADVANCE_SQUAD';
export const SQUAD_START_FIGHT = 'planet/SQUAD_START_FIGHT';
export const SQUAD_FIGHT_WON = 'planet/SQUAD_FIGHT_WON';
export const SQUAD_WIPED = 'planet/SQUAD_WIPED';
export const SQUAD_PROMPT = 'planet/SQUAD_PROMPT';
export const SQUAD_LEAVE_PROMPT = 'planet/SQUAD_LEAVE_PROMPT';
export const SQUAD_RESOLVE_POI = 'planet/SQUAD_RESOLVE_POI';
export const SQUAD_DELIVER_CARGO = 'planet/SQUAD_DELIVER_CARGO';

const OVERALL_MAP_STATUS = {
    unstarted: 'unstarted',
    inProgress: 'inProgress',
    finished: 'finished',
}

// Who drives the planet rotation. manual: the longitude slider. sun: camera locks to the day side.
// squad: camera follows the expedition team (or centers home base when no team is deployed).
export const ROTATION_MODES = {
    manual: 'manual',
    sun: 'sun',
    squad: 'squad'
}

// Initial State
const initialState = {
    map: [],
    homeCoord: null, // [row, col] of the command center; droids spawn here
    overallStatus: OVERALL_MAP_STATUS.unstarted,
    rotation: 0.5,
    rotationMode: 'manual', // see ROTATION_MODES: who drives the camera (longitude slider / sun / expedition team)
    droidData: { // This object mirrors 'structure' format so they can be polymorphic
        numDroidsAssigned: 0,
        droidAssignmentType: 'planet'
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

    // Expedition system (see lib/expeditions.js for domain logic and shapes)
    pois: {},     // by poiId; seeded at GENERATE_MAP, discovered (hidden -> available) as scouting reveals their tiles
    squad: null // the player-driven squad: { coord, path, moveProgress, charge, squadSize, cargo, fighting, prompt }
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
                squad: { $set: null },
                beaconCoord: { $set: null }
            })
        case PROGRESS:
            updates = {
                droids: { $set: payload.droids }
            }

            if (payload.newRotation) {
                updates.rotation = { $set: payload.newRotation };
            }

            addRevealUpdates(state, updates, payload.reveals);

            return update(state, updates);
        case FINISH_EXPLORING_MAP:
            return update(state, {
                overallStatus: { $set: OVERALL_MAP_STATUS.finished },
            })
        case SET_ROTATION:
            return update(state, {
                rotation: { $set: payload.value }
            })
        case SET_ROTATION_MODE:
            return update(state, {
                rotationMode: { $set: payload.mode }
            })
        case ASSIGN_DROID: {
            // payload.amount fresh droids spawn docked (in the grid; they surface wherever there's work);
            // payload.turnAroundIndices are returning droids that turn around in place (recall undone) and
            // resume exploring from wherever they stand next tick.
            const turnAroundSet = new Set(payload.turnAroundIndices || []);
            const spawned = [];
            for (let i = 0; i < payload.amount; i++) {
                spawned.push({ docked: true, coord: null, path: [], target: null, moveProgress: 0, heading: null });
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
                            // docking cleared: a recall outranks docking (and must not be re-tasked as one)
                            { ...droid, returning: true, docking: false, target: null, heading: null, path: recallByIndex[i].path, moveProgress: 0 } :
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
            // Construction complete: the tiles power up NOW, extending the survey halo. Clear any 'finished'
            // status: freshly in-range ground may be sweepable again.
            updates = {
                map: {},
                overallStatus: { $set: OVERALL_MAP_STATUS.inProgress }
            }
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
        case SET_BEACON:
            return update(state, {
                beaconCoord: { $set: payload.coord }
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

        case DEPLOY_SQUAD:
            return update(state, {
                squad: { $set: createSquad(state.homeCoord, payload.squadSize) }
            });
        case DISBAND_SQUAD:
            return update(state, {
                squad: { $set: null }
            });
        case SQUAD_SET_PATH:
            // Moving dismisses any open interaction prompt (walking away IS the "leave" choice)
            return update(state, {
                squad: {
                    path: { $set: payload.path },
                    moveProgress: { $set: 0 },
                    prompt: { $set: null }
                }
            });
        case SQUAD_START_FIGHT:
            // Walked into a nest: outcome decided NOW (deterministic); the fighting state is a timed animation
            // over a known result. Movement locks until it resolves.
            return update(state, {
                squad: {
                    path: { $set: [] },
                    moveProgress: { $set: 0 },
                    prompt: { $set: null },
                    fighting: { $set: { poiId: payload.poiId, remainingMs: FIGHT_DURATION_MS, outcome: payload.outcome } }
                }
            });
        case SQUAD_PROMPT:
            // Standing on a cache/story tile: wait for the player's choice (take/explore or walk away)
            return update(state, {
                squad: {
                    path: { $set: [] },
                    moveProgress: { $set: 0 },
                    prompt: { $set: { poiId: payload.poiId, phase: 'offer' } }
                }
            });
        case SQUAD_LEAVE_PROMPT:
            return update(state, {
                squad: { prompt: { $set: null } }
            });
        case SQUAD_FIGHT_WON: {
            // The skirmish outcome shows in the encounter popup's result phase (losses, reclaimed land, loot)
            updates = {
                pois: { [payload.poiId]: { status: { $set: POI_STATUS.cleared } } },
                squad: {
                    squadSize: { $set: payload.outcome.survivors },
                    cargo: { $apply: (cargo) => mergeCargo(cargo, payload.reward) },
                    prompt: { $set: { poiId: payload.poiId, phase: 'result', result: payload.result } }
                }
            };

            // The nest is dead: its infestation stamp retracts (the land becomes sweepable and developable
            // again, so any 'finished' exploration status is cleared too)
            const nest = state.pois[payload.poiId];
            if (nest && nest.infestRadius != null) {
                updates.map = {};
                [nest.coord, ...getCoordsWithinHops(nest.coord, nest.infestRadius)].forEach(([r, c]) => {
                    if (state.map[r][c].infestedBy === payload.poiId) {
                        if (updates.map[r] === undefined) updates.map[r] = {};
                        updates.map[r][c] = { infestedBy: { $set: null } };
                    }
                });
                updates.overallStatus = { $set: OVERALL_MAP_STATUS.inProgress };
            }

            return update(state, updates);
        }
        case SQUAD_WIPED:
            // Failed assault: squad and cargo are gone; the exact strength is now known for the retry
            return update(state, {
                pois: { [payload.poiId]: { difficultyKnown: { $set: true } } },
                squad: { $set: null }
            });
        case SQUAD_RESOLVE_POI: {
            // Player chose to take/explore/open the site: clear it and load any reward as cargo. A 'narrate'
            // POI holds the popup open on its result phase (story text, salvage); 'auto' closes it here.
            updates = {
                pois: { [payload.poiId]: { status: { $set: POI_STATUS.cleared } } },
                squad: {
                    prompt: { $set: payload.result ?
                        { poiId: payload.poiId, phase: 'result', result: payload.result } : null },
                    cargo: { $apply: (cargo) => mergeCargo(cargo, payload.reward) }
                }
            };

            // Opening a gate unblocks its tile (scouts can pass, land can develop through) and may put new
            // ground in reach, so any 'finished' exploration status is cleared
            const poi = state.pois[payload.poiId];
            if (poi && poi.type === POI_TYPES.gate) {
                updates.map = {
                    [poi.coord[0]]: { [poi.coord[1]]: { gated: { $set: false } } }
                };
                updates.overallStatus = { $set: OVERALL_MAP_STATUS.inProgress };
            }

            return update(state, updates);
        }
        case SQUAD_DELIVER_CARGO:
            return update(state, {
                squad: { cargo: { $set: {} } }
            });
        case ADVANCE_SQUAD:
            // Wholesale snapshot from the pure advanceSquad, plus its line-of-sight reveals (same treatment
            // as scout reveals on PROGRESS: mark explored, discover POIs; resources credits land off this action).
            updates = {
                squad: { $set: payload.squad }
            };
            addRevealUpdates(state, updates, payload.reveals);
            return update(state, updates);
        default:
            return state;
    }
}

// Folds a POI reward's resources into the squad's cargo (pure).
function mergeCargo(cargo, reward) {
    if (!(reward && reward.resources)) return cargo || {};
    const next = { ...(cargo || {}) };
    Object.entries(reward.resources).forEach(([id, amount]) => {
        next[id] = (next[id] || 0) + amount;
    });
    return next;
}

// Shared by PROGRESS (scout reveals) and ADVANCE_SQUAD (squad reveals): mutates `updates` to mark the given
// tiles explored, bump numExplored, and flip any hidden POI on a revealed tile to available.
function addRevealUpdates(state, updates, reveals) {
    if (!reveals || reveals.length === 0) return;

    updates.map = updates.map || {};
    reveals.forEach(([rowIndex, colIndex]) => {
        if (updates.map[rowIndex] === undefined) updates.map[rowIndex] = {};
        updates.map[rowIndex][colIndex] = { status: { $set: STATUSES.explored.enum } };
    });
    updates.numExplored = { $apply: x => x + reveals.length };
    updates.overallStatus = { $set: OVERALL_MAP_STATUS.inProgress };

    // POI discovery: a hidden POI whose tile just got revealed becomes available (shows on map + sidebar)
    const revealKeys = new Set(reveals.map(([r, c]) => `${r},${c}`));
    Object.values(state.pois).forEach(poi => {
        if (poi.status === POI_STATUS.hidden && revealKeys.has(`${poi.coord[0]},${poi.coord[1]}`)) {
            if (updates.pois === undefined) updates.pois = {};
            updates.pois[poi.id] = { status: { $set: POI_STATUS.available } };
        }
    });
}


// Action Creators
export function setRotation(value) {
    return { type: SET_ROTATION, payload: { value } }
}
export function setRotationMode(mode) {
    return { type: SET_ROTATION_MODE, payload: { mode } }
}
export function startCooking() {
    return { type: START_COOK }
}

export function generateMap() {
    const map = generateRandomMap();
    const homeCoord = getHomeBasePosition(map).coord;
    const pois = generatePois(map); // also stamps infestation flags onto the map
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
                const distance = ({ droid }) => droid.coord ? planet.map[droid.coord[0]][droid.coord[1]].graphDistanceHome : -1;
                return distance(a) - distance(b);
            })
            .slice(0, amount);

        const recalls = [];
        const instantIndices = [];
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

function finishExploringMap() {
    return { type: FINISH_EXPLORING_MAP, payload: {} };
}

export function startDevelopment(dispatch, getState, size) {
    const planet = getState().planet;
    // Growth flows toward the beacon when one is set, otherwise stays huddled around home
    const anchorCoord = planet.beaconCoord || planet.homeCoord;
    const coords = getNextDevelopmentArea(planet.map, size, anchorCoord);
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

// Growth beacon (ships with Survey Automation): one optional map click sets the expansion vector; replication
// then consumes frontier tiles nearest it (nearest home when unset). Clicking the beacon's own tile clears it.
export function setBeaconAt(coord) {
    return function(dispatch, getState) {
        if (!surveyAutomationUnlocked(getState())) return;

        const current = getState().planet.beaconCoord;
        const clearing = current && current[0] === coord[0] && current[1] === coord[1];
        dispatch({ type: SET_BEACON, payload: { coord: clearing ? null : coord } });
    }
}

export function clearBeacon() {
    return { type: SET_BEACON, payload: { coord: null } };
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
            if (state.rotationMode === ROTATION_MODES.sun) {
                newRotation = sunTrackingRotation(fromClock.fractionOfDay(getState().clock));
            }
            else if (state.rotationMode === ROTATION_MODES.squad) {
                // Follow the squad; with nobody deployed, center home base instead
                const focusCoord = (state.squad && state.squad.coord) ? state.squad.coord : state.homeCoord;
                if (focusCoord) {
                    newRotation = centeringRotation(focusCoord);
                }
            }

            // Advance the squad (movement or fight countdown + line-of-sight reveals + charge). Runs before
            // the finished-map early-return so driving keeps working on a fully-explored map.
            let planetState = state;
            if (state.squad && (state.squad.path.length > 0 || state.squad.fighting)) {
                const { squad, reveals, events } = advanceSquad(
                    state.map, state.pois, state.squad, timeDelta, state.unlockedTerrains
                );
                const revealedFlatland = reveals.filter(
                    ([r, c]) => state.map[r][c].terrain === TERRAINS.flatland.enum && !state.map[r][c].infestedBy
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

            const finished = planetState.overallStatus === OVERALL_MAP_STATUS.finished;
            // Settled = docked (or never fielded); returning/docking walkers still need ticks to reach the grid
            const allSettled = planetState.droids.every(droid => droid.docked || !droid.coord);

            // Once exploration is finished there's nothing to path, so skip the frontier scan + droid work entirely
            // (keeps end-state catch-up after a long tab-away ~free). This is re-armed by ASSIGN_DROID and by
            // FINISH_DEVELOPMENT (halo growth) -- so it never permanently locks out droids that could still do work.
            // Exception: droids still walking to the grid (recalled or docking) must keep advancing.
            if (finished && allSettled) {
                if (newRotation) {
                    dispatch({ type: PROGRESS, payload: { newRotation, droids: planetState.droids, reveals: [], revealedFlatland: 0, numArrivedHome: 0 } });
                }
                return;
            }

            // Scouts sweep coverage, never frontier: their targets are bounded to the grid halo (see getGridHalo).
            const { halo } = getGridHalo(planetState.map, planetState.haloRadius);

            // Don't bother re-targeting idle droids once there's nothing left to reach (avoids a pathfind per idle droid).
            const complete = finished || isExplorationComplete(planetState.map, planetState.unlockedTerrains, halo);

            const { droids, reveals, numArrivedHome } = advanceDroids(
                planetState.map, planetState.droids, timeDelta * planetState.exploreSpeed, planetState.unlockedTerrains, !complete, halo
            );

            // Newly-revealed flatland becomes buildable land (resources reducer listens for this on PROGRESS).
            // Infested flatland doesn't count -- it credits later, when its nest is cleared.
            const revealedFlatland = reveals.filter(
                ([r, c]) => planetState.map[r][c].terrain === TERRAINS.flatland.enum && !planetState.map[r][c].infestedBy
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

function sealedText(poi) {
    return `${poi.name} is sealed — requires ${CAPABILITY_LABELS[poi.requires] || poi.requires}.`;
}

export function deploySquad(squadSize) {
    return function(dispatch, getState) {
        const state = getState();
        const planet = state.planet;
        if (planet.squad || !planet.homeCoord) return;
        if (squadSize < 1 || !canConsume(state.resources, { standardDroids: squadSize })) return;

        dispatch(withRecalculation({ type: DEPLOY_SQUAD, payload: { squadSize } }));
        dispatch(setRotationMode(ROTATION_MODES.squad)); // follow-cam makes driving feel right immediately
    }
}

// Disbanding requires standing on the powered grid (walk home first); survivors and cargo credit there.
export function disbandSquad() {
    return function(dispatch, getState) {
        const planet = getState().planet;
        const squad = planet.squad;
        if (!squad || squad.fighting) return;
        if (!isOnGrid(planet.map, squad.coord)) return;

        dispatch(withRecalculation({
            type: DISBAND_SQUAD,
            payload: { survivors: squad.squadSize, cargo: squad.cargo || {} }
        }));
        const delivered = squad.cargo && Object.keys(squad.cargo).length > 0 ?
            ` Delivered ${formatResourceList(squad.cargo)}.` : '';
        dispatch(logInline(`Team returned to base (${squad.squadSize} droids).${delivered}`));
    }
}

// Keyboard step onto an adjacent tile. Stepping into an unknown impassable tile reveals it (you probed the
// wall and learned something) but does not move -- the caller shows a bump either way on `false`.
// POI blocking (nests, sealed sites) is the component's concern: it decides bump-vs-attack per input rules.
export function squadStep(coord) {
    return function(dispatch, getState) {
        const planet = getState().planet;
        const squad = planet.squad;
        if (!squad || squad.fighting) return false;

        if (!isPassable(planet.map, coord, planet.unlockedTerrains)) {
            if (planet.map[coord[0]][coord[1]].status === STATUSES.unknown.enum) {
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
 * render it: 'moved' | 'attacked' | 'blocked' (bump) | 'busy' (no squad / mid-fight: ignore silently).
 *
 * Contact rules: stepping into an available nest starts the fight -- tapped OR held (running headlong into a
 * nest is a fight, Pokemon-grass style; the posted difficulty was your warning). Sealed sites bump (with a
 * report on deliberate taps only, so held keys don't spam it). Hidden blocking POIs reveal on the bump, same
 * as probing an unknown wall -- you discover the danger, and the NEXT step in commits.
 */
export function squadStepInto(coord, tap) {
    return function(dispatch, getState) {
        const planet = getState().planet;
        const squad = planet.squad;
        if (!squad || squad.fighting) return 'busy';

        const blockingPoi = Object.values(planet.pois).find(poi =>
            poi.status !== POI_STATUS.cleared &&
            poi.coord[0] === coord[0] && poi.coord[1] === coord[1] &&
            (poi.type === POI_TYPES.nest || (poi.requires && !planet.unlockedTerrains[poi.requires]))
        );

        if (blockingPoi) {
            if (blockingPoi.status === POI_STATUS.hidden) {
                // Probing the dark found something: reveal it (tile reveal flips the POI to available)
                dispatch({ type: ADVANCE_SQUAD, payload: { squad, reveals: [coord], revealedFlatland: 0 } });
                return 'blocked';
            }
            if (blockingPoi.requires && !planet.unlockedTerrains[blockingPoi.requires]) {
                if (tap) dispatch(logInline(sealedText(blockingPoi)));
                return 'blocked';
            }
            if (dispatch(squadAttack(blockingPoi.id))) {
                return 'attacked';
            }
            return 'blocked';
        }

        return dispatch(squadStep(coord)) ? 'moved' : 'blocked';
    }
}

// Player accepts the open interaction prompt (take the cache / explore the site): resolve the POI, load any
// reward as cargo, file the report.
export function squadInteract() {
    return function(dispatch, getState) {
        const planet = getState().planet;
        const squad = planet.squad;
        if (!squad || !squad.prompt || squad.prompt.phase !== 'offer') return false;

        const poi = planet.pois[squad.prompt.poiId];
        if (!poi || poi.status !== POI_STATUS.available) {
            dispatch({ type: SQUAD_LEAVE_PROMPT });
            return false;
        }

        // A 'narrate' POI's outcome shows in the popup's result phase; the fields stay serializable and the
        // display strings are composed at render time (story text lookup, capability label, loot list)
        const result = resultBehaviorFor(poi) === 'narrate' ? {
            storyId: poi.storyId || null,
            capability: (poi.reward && poi.reward.capability) || null,
            loaded: (poi.reward && poi.reward.resources) || null
        } : null;

        dispatch({ type: SQUAD_RESOLVE_POI, payload: { poiId: poi.id, reward: poi.reward, result } });
        if (poi.reward && poi.reward.capability) {
            dispatch(unlockTerrain(poi.reward.capability)); // salvaged tool: permanent, instant (not cargo)
        }
        return true;
    }
}

// Player declines the prompt without moving. (Walking away does the same thing implicitly.)
export function squadLeavePrompt() {
    return { type: SQUAD_LEAVE_PROMPT };
}

// Bump-to-attack: a deliberate tap into an adjacent uncleared nest starts the fight. The outcome is decided
// here (deterministic strength check); the fighting state is a timed animation over that known result.
export function squadAttack(poiId) {
    return function(dispatch, getState) {
        const planet = getState().planet;
        const squad = planet.squad;
        const poi = planet.pois[poiId];

        if (!squad || squad.fighting) return false;
        if (!poi || poi.status === POI_STATUS.cleared) return false;
        if (poi.requires && !planet.unlockedTerrains[poi.requires]) {
            dispatch(logInline(sealedText(poi)));
            return false;
        }
        // Must be standing next to it -- the tap that initiated this was a step onto the nest tile
        const adjacent = getAdjacentCoords(squad.coord)
            .some(([r, c]) => r === poi.coord[0] && c === poi.coord[1]);
        if (!adjacent) return false;

        dispatch({ type: SQUAD_START_FIGHT, payload: { poiId, outcome: computeOutcome(poi, squad.squadSize) } });
        return true;
    }
}

// Applies advanceSquad's contact/fight events (dispatched from planetTick).
function resolveSquadEvent(dispatch, getState, squad, event) {
    const pois = getState().planet.pois;

    switch (event.type) {
        case 'fightOver': {
            const poi = pois[event.poiId];
            const outcome = event.outcome;
            const reward = outcome.success ? poi.reward : null;

            // Reclaimed land: the stamp's already-revealed flatland credits NOW (counted before the reducer
            // retracts the flags); still-unknown stamp tiles credit later through the normal reveal path.
            let landCredit = 0;
            if (outcome.success && poi.infestRadius != null) {
                const planetMap = getState().planet.map;
                [poi.coord, ...getCoordsWithinHops(poi.coord, poi.infestRadius)].forEach(([r, c]) => {
                    const sector = planetMap[r][c];
                    if (sector.infestedBy === event.poiId && sector.status === STATUSES.explored.enum &&
                        sector.terrain === TERRAINS.flatland.enum) {
                        landCredit++;
                    }
                });
            }

            if (outcome.survivors > 0) {
                // The outcome narrates in the popup's result phase (the squad is standing right there)
                dispatch({ type: SQUAD_FIGHT_WON, payload: { poiId: event.poiId, outcome, reward, landCredit,
                    result: {
                        losses: outcome.losses,
                        squadSize: outcome.survivors + outcome.losses,
                        landCredit,
                        capability: (reward && reward.capability) || null,
                        loaded: (reward && reward.resources) || null
                    } } });
            }
            else {
                // A wipe leaves no squad to anchor a popup to; the terminal carries the bad news
                dispatch({ type: SQUAD_WIPED, payload: { poiId: event.poiId } });
                const cargoLost = squad.cargo && Object.keys(squad.cargo).length > 0 ?
                    ` Cargo lost: ${formatResourceList(squad.cargo)}.` : '';
                dispatch(logInline(
                    `Team lost assaulting ${poi.name}. Hostile strength confirmed: ${poi.difficulty}.${cargoLost}`));
            }
            if (outcome.success && reward && reward.capability) {
                dispatch(unlockTerrain(reward.capability));
            }
            dispatch(recalculateState());
            break;
        }
        case 'enteredPoi': {
            // Walked onto a cache/story tile: movement stops and the interaction prompt opens (the player
            // chooses to take/explore via squadInteract, or walks away)
            dispatch({ type: SQUAD_PROMPT, payload: { poiId: event.poiId } });
            break;
        }
        case 'onGrid': {
            // Touched powered ground: bank any cargo
            const current = getState().planet.squad;
            if (current && current.cargo && Object.keys(current.cargo).length > 0) {
                dispatch({ type: SQUAD_DELIVER_CARGO, payload: { cargo: current.cargo } });
                dispatch(logInline(`Cargo banked: ${formatResourceList(current.cargo)}.`));
                dispatch(recalculateState());
            }
            break;
        }
    }
}

// Standard functions

export function percentExplored(state) {
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
function advanceDroids(map, droids, moveAmount, unlocks, allowRetarget, halo = null) {
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
    // A lookout target is only worth heading to while it still has an IN-HALO unknown neighbor left to reveal.
    const isUsefulLookout = (coord) => getAdjacentCoords(coord)
        .some(([r, c]) => !isRevealed(r, c) && (!halo || halo.has(`${r},${c}`)));
    // Targets currently spoken for, so two droids don't walk to the same tile.
    const claimed = new Set(droids.map(d => d.target).filter(Boolean).map(t => `${t[0]},${t[1]}`));
    const claim = (target) => claimed.add(`${target[0]},${target[1]}`);

    const dockedDroid = () => ({ docked: true, coord: null, path: [], target: null, moveProgress: 0, heading: null });

    // Walk a returning/docking droid's path over known ground (no reveals); returns the moved fields.
    const walkPath = (droid) => {
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

    const nextDroids = [];
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
        reveals: Array.from(reveals).map(key => key.split(',').map(Number)),
        numArrivedHome
    };
}
