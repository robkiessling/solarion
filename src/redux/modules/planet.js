import update from 'immutability-helper';
import {canStartSector, recalculateState, withRecalculation} from "../reducer";
import {
    generateRandomMap,
    getNextExplorableSector,
    mapIsFullyExplored,
    numCoordsWithStatus,
    STATUSES
} from "../../lib/planet_map";
import {batch} from "react-redux";

// Actions
export const GENERATE_MAP = 'planet/GENERATE_MAP';
export const PROGRESS = 'planet/PROGRESS';
export const START_SECTOR = 'planet/START_SECTOR';
export const FINISH_SECTOR = 'planet/FINISH_SECTOR';
export const FINISH_MAP = 'planet/FINISH_MAP';

const OVERALL_MAP_STATUS = {
    unstarted: 'unstarted',
    inProgress: 'inProgress',
    finished: 'finished',
}

// Initial State
const initialState = {
    map: [],
    overallStatus: OVERALL_MAP_STATUS.unstarted,

    // The following caches store references/counts of various sectors within the map. They could be calculated at run-time
    // from the map variable, but to improve performance we cache the values here.
    coordsInProgress: [], // Coordinates of sectors that are in progress
    numExplored: 0 // Number of explored sectors
}

// Reducer
export default function reducer(state = initialState, action) {
    const payload = action.payload;

    switch (action.type) {
        case GENERATE_MAP:
            const map = generateRandomMap();

            return update(state, {
                map: { $set: map },
                numExplored: { $set: numCoordsWithStatus(map, STATUSES.explored.enum) }
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
        default:
            return state;
    }
}


// Action Creators
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
