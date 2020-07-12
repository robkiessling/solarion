import update from 'immutability-helper';
import _ from 'lodash';
import database from '../../database/structures'
import {getModifiedTotal, mapObject, mergeModsAtDepth} from "../../lib/helpers";
import * as fromUpgrades from "./upgrades";

// Actions
export const LEARN = 'structures/LEARN';
export const BUILD = 'structures/BUILD';
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
            return update(state, {
                byId: {
                    [payload.structure.id]: {
                        count: {
                            total: { $apply: function(x) { return x + payload.amount; } }
                        }
                    }
                }
            });
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
        case fromUpgrades.RESEARCH:
            return update(state, {
                byId: {
                    [payload.structureId]: mapObject(payload.upgrade.effects, (attribute, resourceMods) => (
                        mergeModsAtDepth(resourceMods, 1)
                    ))
                }
            })
        default:
            return state;
    }
}

// Action Creators
export function learn(id) {
    return { type: LEARN, payload: { id } };
}

export function buildUnsafe(structure, amount) {
    return { type: BUILD, payload: { structure, amount } };
}

export function toggleRunning(id, isRunning) {
    const amount = isRunning ? 1 : 0;
    return { type: SET_RUNNING, payload: { id, amount } };
}


// Standard Functions
export function getStructure(state, id) {
    return state.byId[id];
}
export function getBuildCost(structure) {
    return mapObject(structure.cost, (resourceId, cost) => getModifiedTotal(cost) * (cost.increment)**(structure.count.total));
}
export function getNumRunning(structure) {
    // If not runnable (no on/off switch), the "num running" is always just the total amount built
    return structure.runnable ? structure.count.running : structure.count.total;
}
export function getProduction(structure, forCount) {
    if (forCount === undefined) { forCount = getNumRunning(structure); }
    if (structure.produces === undefined) { return {}; }
    return mapObject(structure.produces, (resourceId, production) => getModifiedTotal(production) * forCount);
}
export function getConsumption(structure, forCount) {
    if (forCount === undefined) { forCount = getNumRunning(structure); }
    if (structure.consumes === undefined) { return {}; }
    return mapObject(structure.consumes, (resourceId, consumption) => getModifiedTotal(consumption) * forCount);
}




// Helpers
export function iterateVisible(state, callback) {
    state.visibleIds.forEach(id => {
        callback(getStructure(state, id));
    });
}