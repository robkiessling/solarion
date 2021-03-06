import update from 'immutability-helper';
import database, {calculators, STATUSES, TYPES} from '../../database/structures'
import {mapObject} from "../../lib/helpers";
import {withRecalculation} from "../reducer";

export const UNKNOWN_IMAGE_KEY = 'unknown';
export { calculators };

// Actions
export const LEARN = 'structures/LEARN';
export const BUILD = 'structures/BUILD';
export const BUILD_FOR_FREE = 'structures/BUILD_FOR_FREE';
export const SET_RUNNING_RATE = 'structures/SET_RUNNING_RATE';
export const SET_STATUS = 'structures/SET_STATUS';

// Initial State
const initialState = {
    byId: {},
    visibleIds: []
}

// Reducers
export default function reducer(state = initialState, action) {
    const payload = action.payload;

    switch (action.type) {
        case LEARN:
            return update(state, {
                byId: {
                    [payload.id]: {
                        $set: _.merge({}, database[payload.id], { id: payload.id })
                    }
                },
                visibleIds: { $push: [payload.id] }
            });
        case BUILD:
            return buildReducer(state, payload.structure.id, payload.amount);
        case BUILD_FOR_FREE:
            return buildReducer(state, payload.id, payload.amount);
        case SET_RUNNING_RATE:
            return update(state, {
                byId: {
                    [payload.id]: {
                        runningRate: { $set: payload.amount }
                    }
                }
            });
        case SET_STATUS:
            return update(state, {
                byId: {
                    [payload.id]: {
                        status: { $set: payload.status }
                    }
                }
            })
        default:
            return state;
    }
}

function buildReducer(state, id, amount) {
    return update(state, {
        byId: {
            [id]: {
                count: {
                    total: { $apply: function(x) { return x + amount; } }
                }
            }
        }
    });
}

// Action Creators
export function learn(id) {
    return withRecalculation({ type: LEARN, payload: { id } });
}

export function buildUnsafe(structure, amount) {
    return withRecalculation({ type: BUILD, payload: { structure, amount } });
}

export function buildForFree(id, amount) {
    return withRecalculation({ type: BUILD_FOR_FREE, payload: { id, amount } });
}

export function turnOff(id) {
    return setRunningRate(id, 0);
}
export function setRunningRate(id, amount) {
    return withRecalculation({ type: SET_RUNNING_RATE, payload: { id, amount } });
}

// Passing dispatch so we can determine if we need the action to do something or not (no sense dispatch if nothing will change)
export function setNormalStatus(dispatch, structure) {
    if (structure.status !== STATUSES.normal) {
        dispatch({ type: SET_STATUS, payload: { id: structure.id, status: STATUSES.normal } })
    }
}
export function setInsufficientStatus(dispatch, structure) {
    if (structure.status !== STATUSES.insufficient) {
        dispatch({ type: SET_STATUS, payload: { id: structure.id, status: STATUSES.insufficient } })
    }
}


// Standard Functions
export function getStructure(state, id) {
    return state.byId[id];
}
export function getBuildCost(structure) {
    return structure.cost;
}
export function getNumBuilt(structure) {
    if (!structure) { return 0; }
    return structure.count.total;
}
export function getRunningRate(structure) {
    return structure.runnable ? structure.runningRate : 1;
}
export function canRunStructure(state, structure) {
    return structure.runnable && calculators[structure.id].canRun &&
        calculators[structure.id].canRun(state, structure);
}
export function getImage(structure) {
    if (hasInsufficientResources(structure)) {
        return 'idle';
    }
    if (getNumBuilt(structure) === 0) {
        return UNKNOWN_IMAGE_KEY;
    }
    return structure.runnable ? (getRunningRate(structure) > 0 ? 'running' : 'idle') : 'idle'
}
export function getStatusMessage(structure) {
    switch(structure.status) {
        case STATUSES.normal:
            return '';
        case STATUSES.insufficient:
            return 'Insufficient Resources';
        default:
            return '';
    }
}
export function hasInsufficientResources(structure) {
    return structure.status === STATUSES.insufficient;
}

export function getVisibleIds(state, type) {
    if (type === undefined) {
        return state.visibleIds;
    }

    return state.visibleIds.filter(id => {
        return getStructure(state, id).type === TYPES[type];
    });
}

// Gets statistics based on how many of the structures are built. Statistics can be any keys on the structure record.
export function getStatistic(structure, statistic, forCount) {
    if (structure[statistic] === undefined) {
        return {};
    }
    if (forCount === undefined) {
        forCount = getNumBuilt(structure);
    }
    return mapObject(structure[statistic], (key, value) => value * forCount);
}


// Helpers
export function iterateVisible(state, callback) {
    state.visibleIds.forEach(id => {
        callback(getStructure(state, id));
    });
}