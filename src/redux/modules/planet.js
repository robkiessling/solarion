import update from 'immutability-helper';
import {canStartSector, recalculateState, withRecalculation} from "../reducer";
import {
    generateRandomMap,
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
export const START_SECTOR = 'planet/START_SECTOR';
export const FINISH_SECTOR = 'planet/FINISH_SECTOR';
export const FINISH_MAP = 'planet/FINISH_MAP';
export const SET_ROTATION = 'planet/SET_ROTATION';
export const SET_SUN_TRACKING = 'planet/SET_SUN_TRACKING';

const OVERALL_MAP_STATUS = {
    unstarted: 'unstarted',
    inProgress: 'inProgress',
    finished: 'finished',
}

// Initial State
const initialState = {
    map: [],
    overallStatus: OVERALL_MAP_STATUS.unstarted,
    rotation: 0.5,
    sunTracking: false, // TODO need to fix twilight shading if going to use this

    // The following caches store references/counts of various sectors within the map. They could be calculated at run-time
    // from the map variable, but to improve performance we cache the values here.
    coordsInProgress: [], // Coordinates of sectors that are in progress
    numExplored: 0, // Number of explored sectors
    numExploredFlatland: 0
}

// Reducer
export default function reducer(state = initialState, action) {
    const payload = action.payload;

    switch (action.type) {
        case GENERATE_MAP:
            const map = generateRandomMap();

            return update(state, {
                map: { $set: map },
                numExplored: { $set: numSectorsMatching(map, STATUSES.explored.enum) },
                numExploredFlatland: { $set: numSectorsMatching(map, STATUSES.explored.enum, TERRAINS.flatland.enum) }
            })
        case START_SECTOR:
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
        case FINISH_SECTOR:
            const sectorIsFlatland = state.map[payload.rowIndex][payload.colIndex].terrain === TERRAINS.flatland.enum

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
                numExplored: { $apply: (x) => x + 1 },
                numExploredFlatland: { $apply: (x) => sectorIsFlatland ? x + 1 : x }
            });
        case PROGRESS:
            if (state.overallStatus !== OVERALL_MAP_STATUS.inProgress) {
                return state;
            }

            // Figure out which rows have a sector in progress. If a row does not have a sector in progress, it will
            // simply be returned as is (avoids re-mapping the row into a new array))
            const rowsIndexesInProgress = _.uniq(state.coordsInProgress.map(coord => coord[0]));

            let newMap = state.map.map((row, rowIndex) => {
                if (rowsIndexesInProgress.includes(rowIndex)) {
                    return row.map(sector => {
                        if (sector.status === STATUSES.exploring.enum) {
                            return Object.assign({}, sector, {
                                exploreProgress: sector.exploreProgress + payload.timeDelta
                            });
                        }
                        else {
                            return sector;
                        }
                    });
                }
                else {
                    return row; // Do not need to re-map the row to a new array
                }
            });
            return Object.assign({}, state, { map: newMap });
        case FINISH_MAP:
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
    return { type: GENERATE_MAP };
}

export function startMap() {
    return (dispatch, getState) => {
        const [rowIndex, colIndex] = getNextExplorableSector(getState().planet.map);
        startSectorUnsafe(dispatch, rowIndex, colIndex);
    }
}

function finishMap() {
    return { type: FINISH_MAP, payload: {} };
}

function startSectorUnsafe(dispatch, rowIndex, colIndex) {
    dispatch({ type: START_SECTOR, payload: { rowIndex, colIndex } })
    dispatch(recalculateState());
}

function finishSector(dispatch, rowIndex, colIndex) {
    dispatch({ type: FINISH_SECTOR, payload: { rowIndex, colIndex } })
    dispatch(recalculateState());
}

export function planetTick(timeDelta) {
    return (dispatch, getState) => {
        batch(() => {
            dispatch({ type: PROGRESS, payload: { timeDelta } });

            if (getState().planet.overallStatus !== OVERALL_MAP_STATUS.inProgress) {
                return;
            }

            getState().planet.map.forEach((row, rowIndex) => {
                row.forEach((sector, colIndex) => {
                    if (sector.status === STATUSES.exploring.enum) {
                        if (sector.exploreProgress >= sector.exploreLength * 1000) {
                            finishSector(dispatch, rowIndex, colIndex);
                        }
                    }
                })
            });

            if (mapIsFullyExplored(getState().planet.map)) {
                dispatch(finishMap());
            }
            else if (canStartSector(getState())) {
                const [nextRowIndex, nextColIndex] = getNextExplorableSector(getState().planet.map);
                if (nextRowIndex !== undefined) {
                    startSectorUnsafe(dispatch, nextRowIndex, nextColIndex)
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