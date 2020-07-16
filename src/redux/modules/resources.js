import update from 'immutability-helper';
import {getModifiedTotal, mapObject, mergeModsAtDepth} from "../../lib/helpers";
import _ from 'lodash';
import database from '../../database/resources'
import * as fromStructures from "./structures";
import * as fromUpgrades from "./upgrades";

// Actions
export const LEARN = 'resources/LEARN';
export const CONSUME = 'resources/CONSUME';
export const PRODUCE = 'resources/PRODUCE';

// Initial State
const initialState = {
    byId: {},
    visibleIds: []
}

// Reducer
export default function reducer(state = initialState, action) {
    const payload = action.payload;

    switch (action.type) {
        case LEARN:
            return update(state, {
                byId: {
                    [payload.id]: {
                        $set: _.merge({}, database[payload.id], { id: payload.id, lifetimeTotal: database[payload.id].amount })
                    }
                },
                visibleIds: { $push: [payload.id] }
            });
        case CONSUME:
            return consumeReducer(state, payload.amounts);
        case PRODUCE:
            return produceReducer(state, payload.amounts);
        case fromStructures.BUILD:
            state = consumeReducer(state, fromStructures.getBuildCost(payload.structure));
            if (payload.structure.resourceEffects) {
                state = update(state, {
                    byId: mergeModsAtDepth(payload.structure.resourceEffects, 2)
                })
            }
            return state;
        case fromUpgrades.RESEARCH:
            return consumeReducer(state, fromUpgrades.getResearchCost(payload.upgrade));
        default:
            return state;
    }
}
function consumeReducer(state, amounts) {
    return update(state, {
        byId: mapObject(amounts, (resourceId, amount) => (
            { amount: { $apply: function(x) { return x - amount; } } }
        ))
    });
}
function produceReducer(state, amounts) {
    return update(state, {
        byId: mapObject(amounts, (resourceId, amount) => {
            const resource = getResource(state, resourceId);
            const capacity = getCapacity(resource);
            const oldAmount = getQuantity(resource);
            const newAmount = Math.min(oldAmount + amount, capacity);
            const gain = capacity === Infinity ? amount : (newAmount - oldAmount);
            return {
                amount: { $set: newAmount },
                lifetimeTotal: { $apply: function(x) { return x + gain; } }
            }
        })
    });
}

// Action Creators
export function learn(id) {
    return { type: LEARN, payload: { id } };
}

export function consume(amounts) {
    return function(dispatch, getState) {
        if (canConsume(getState().resources, amounts)) {
            dispatch(consumeUnsafe(amounts));
        }
    }
}
export function consumeUnsafe(amounts) {
    return { type: CONSUME, payload: { amounts } };
}

export function produce(amounts) {
    return { type: PRODUCE, payload: { amounts } };
}

// Standard Functions
export function getResource(state, id) {
    return state.byId[id];
}
export function canConsume(state, amounts) {
    return Object.entries(amounts).every(([k,v]) => getQuantity(getResource(state, k)) >= v);
}
export function getQuantity(resource) {
    return resource.amount;
}
export function getCapacity(resource) {
    return getModifiedTotal(resource.capacity);
}
