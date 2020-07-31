import update from 'immutability-helper';
import _ from 'lodash';
import database, { calculators } from '../../database/structures'
import {mapObject} from "../../lib/helpers";
import * as fromUpgrades from "./upgrades";
import {withRecalculation} from "../reducer";

// Actions
export const LEARN = 'structures/LEARN';
export const BUILD = 'structures/BUILD';
export const BUILD_FOR_FREE = 'structures/BUILD_FOR_FREE';
export const SET_RUNNING = 'structures/SET_RUNNING';

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
        case SET_RUNNING:
            return update(state, {
                byId: {
                    [payload.id]: {
                        count: {
                            running: { $set: payload.amount }
                        }
                    }
                }
            });
        case fromUpgrades.LEARN:
            return update(state, {
                byId: {
                    [payload.structureId]: {
                        visibleUpgrades: { $push: [payload.id] }
                    }
                }
            });
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

export function toggleRunning(id, isRunning) {
    const amount = isRunning ? 1 : 0;
    return withRecalculation({ type: SET_RUNNING, payload: { id, amount } });
}
export function setRunning(id, amount) {
    return withRecalculation({ type: SET_RUNNING, payload: { id, amount } });
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
export function getNumRunning(structure) {
    // If not runnable (no on/off switch), the "num running" is always just the total amount built
    return structure.runnable ? structure.count.running : getNumBuilt(structure);
}
export function getProduction(structure, forCount) {
    if (forCount === undefined) { forCount = getNumRunning(structure); }
    if (structure.produces === undefined) { return {}; }
    return mapObject(structure.produces, (resourceId, production) => production * forCount);
}
export function getConsumption(structure, forCount) {
    if (forCount === undefined) { forCount = getNumRunning(structure); }
    if (structure.consumes === undefined) { return {}; }
    return mapObject(structure.consumes, (resourceId, consumption) => consumption * forCount);
}

/**
 * @param state Refers to the full state (unlike other methods which already refer to the structures slice)
 * @returns {*} Overrides to update various structure values
 */
export function calculations(state) {
    return mapObject(state.structures.byId, (structureId, structure) => {
        if (!calculators[structureId]) { return {}; }

        return mapObject(calculators[structureId], (attr, calculator) => {
            return { $set: calculator(state, structure) };
        });
    });
}


// Helpers
export function iterateVisible(state, callback) {
    state.visibleIds.forEach(id => {
        callback(getStructure(state, id));
    });
}