import update from 'immutability-helper';
import {recalculateState, withRecalculation} from "../reducer";
import {
    generateRandomMap, getCurrentDevelopmentArea, getNextDevelopmentArea,
    getNextExplorableSector,
    mapIsFullyExplored, NUM_SECTORS,
    numSectorsMatching,
    STATUSES, TERRAINS
} from "../../lib/planet_map";
import {batch} from "react-redux";
import {roundToDecimal} from "../../lib/helpers";

// Actions
export const GENERATE_MAP = 'planet/GENERATE_MAP';
export const PROGRESS = 'planet/PROGRESS';
export const START_EXPLORING_SECTOR = 'planet/START_EXPLORING_SECTOR';
export const FINISH_EXPLORING_SECTOR = 'planet/FINISH_EXPLORING_SECTOR';
export const FINISH_EXPLORING_MAP = 'planet/FINISH_EXPLORING_MAP';
export const SET_ROTATION = 'planet/SET_ROTATION';
export const SET_SUN_TRACKING = 'planet/SET_SUN_TRACKING';
export const ASSIGN_DROID = 'planet/ASSIGN_DROID';
export const REMOVE_DROID = 'planet/REMOVE_DROID';
export const START_DEVELOPMENT = 'planet/START_DEVELOPMENT';
export const FINISH_DEVELOPMENT = 'planet/FINISH_DEVELOPMENT';
export const SET_EXPLORE_SPEED = 'planet/SET_EXPLORE_SPEED';

const OVERALL_MAP_STATUS = {
    unstarted: 'unstarted',
    inProgress: 'inProgress',
    finished: 'finished',
}

const MAX_DROIDS_PER_SECTOR = 5;

// Initial State
const initialState = {
    map: [],
    overallStatus: OVERALL_MAP_STATUS.unstarted,
    rotation: 0.5,
    sunTracking: false, // TODO need to fix twilight shading if going to use this
    droidData: { // This object mirrors 'structure' format so they can be polymorphic
        numDroidsAssigned: 0,
        droidAssignmentType: 'planet'
    },
    exploreSpeed: 1,

    // The following caches store references/counts of various sectors within the map. They could be calculated at run-time
    // from the map variable, but to improve performance we cache the values here.
    // TODO use https://github.com/reduxjs/reselect instead?
    coordsInProgress: [], // Coordinates of sectors that are in progress
    numExplored: 0, // Number of explored sectors
    maxDevelopedLand: 0,
}

// Reducer
export default function reducer(state = initialState, action) {
    const payload = action.payload;
    let updates;

    switch (action.type) {
        case GENERATE_MAP:
            return update(state, {
                map: { $set: payload.map },
                numExplored: { $set: numSectorsMatching(payload.map, STATUSES.explored.enum) },
                maxDevelopedLand: { $set: numSectorsMatching(payload.map, undefined, TERRAINS.flatland.enum) + 1 } // add 1 for home base
            })
        case START_EXPLORING_SECTOR:
            return update(state, {
                overallStatus: { $set: OVERALL_MAP_STATUS.inProgress },
                map: {
                    [payload.rowIndex]: {
                        [payload.colIndex]: {
                            status: { $set: STATUSES.exploring.enum },
                            exploreProgress: { $set: 0 }
                        }
                    }
                },
                coordsInProgress: { $push: [[payload.rowIndex, payload.colIndex]] }
            });
        case FINISH_EXPLORING_SECTOR:
            return update(state, {
                map: {
                    [payload.rowIndex]: {
                        [payload.colIndex]: {
                            status: { $set: STATUSES.explored.enum },
                            exploreProgress: { $set: undefined }
                        }
                    }
                },
                coordsInProgress: {
                    // Remove the coord from coordsInProgress
                    $apply: (coords) => coords.filter(coord => coord[0] !== payload.rowIndex || coord[1] !== payload.colIndex)
                },
                numExplored: { $apply: (x) => x + 1 }
            });
        case PROGRESS:
            updates = {
                map: {}
            }

            // Assign available droids to various sectors. E.g. if MAX_DROIDS_PER_SECTOR is 5, and there are 12 droids:
            // - sector #1 gets 5 droids
            // - sector #2 gets 5 droids
            // - sector #3 gets 2 droids
            let availableDroids = state.droidData.numDroidsAssigned;
            const progressRate = payload.timeDelta * state.exploreSpeed;
            state.coordsInProgress.forEach(coord => {
                const numDroidsForSector = Math.min(availableDroids, MAX_DROIDS_PER_SECTOR);
                availableDroids -= numDroidsForSector;

                if (updates.map[coord[0]] === undefined) {
                    updates.map[coord[0]] = {}
                }
                updates.map[coord[0]][coord[1]] = {
                    exploreProgress: { $apply: x => x + progressRate * numDroidsForSector }
                }
            });

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
        case ASSIGN_DROID:
            return update(state, {
                droidData: {
                    numDroidsAssigned: { $apply: (x) => x + 1 }
                }
            });
        case REMOVE_DROID:
            return update(state, {
                droidData: {
                    numDroidsAssigned: { $apply: (x) => x - 1 }
                }
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

export function generateMap() {
    const map = generateRandomMap();
    return { type: GENERATE_MAP, payload: { map } };
}

export function assignDroidUnsafe() {
    return withRecalculation({ type: ASSIGN_DROID });
}
export function removeDroidUnsafe() {
    return withRecalculation({ type: REMOVE_DROID });
}

export function startExploringMap() {
    return (dispatch, getState) => {
        const [rowIndex, colIndex] = getNextExplorableSector(getState().planet.map);
        startExploringSectorUnsafe(dispatch, rowIndex, colIndex);
    }
}

function finishExploringMap() {
    return { type: FINISH_EXPLORING_MAP, payload: {} };
}

function startExploringSectorUnsafe(dispatch, rowIndex, colIndex) {
    dispatch({ type: START_EXPLORING_SECTOR, payload: { rowIndex, colIndex } })
    dispatch(recalculateState());
}

function finishExploringSector(dispatch, rowIndex, colIndex, sector) {
    dispatch({ type: FINISH_EXPLORING_SECTOR, payload: { rowIndex, colIndex, sector } })
    dispatch(recalculateState());
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

export function planetTick(timeDelta) {
    return (dispatch, getState) => {
        batch(() => {
            if (getState().planet.overallStatus !== OVERALL_MAP_STATUS.inProgress) {
                return;
            }

            dispatch({ type: PROGRESS, payload: { timeDelta } });

            getState().planet.coordsInProgress.forEach(coord => {
                const sector = getState().planet.map[coord[0]][coord[1]];
                if (sector.exploreProgress >= sector.exploreLength * 1000) {
                    finishExploringSector(dispatch, coord[0], coord[1], sector);
                }
            });

            if (mapIsFullyExplored(getState().planet.map)) {
                dispatch(finishExploringMap());
            }
            else {
                const numDroids = getState().planet.droidData.numDroidsAssigned;
                const droidCapacity = getState().planet.coordsInProgress.length * MAX_DROIDS_PER_SECTOR;

                if (numDroids > droidCapacity) {
                    // If we're over capacity we're ready to start exploring a new sector
                    const [nextRowIndex, nextColIndex] = getNextExplorableSector(getState().planet.map);
                    if (nextRowIndex !== undefined) {
                        startExploringSectorUnsafe(dispatch, nextRowIndex, nextColIndex)
                    }
                }
            }
        });
    }
}


// Standard functions

// Count the number of explored sectors, plus the partial exploration of all sectors currently being explored
export function percentExplored(state){
    let numExplored = state.numExplored;

    state.coordsInProgress.forEach(coord => {
        const sector = state.map[coord[0]][coord[1]]
        numExplored += sector.exploreProgress / (sector.exploreLength * 1000)
    })

    return numExplored / NUM_SECTORS * 100
}