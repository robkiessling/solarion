import update from 'immutability-helper';
import {getModifiedTotal, mapObject, mergeModsAtDepth} from "../../lib/helpers";
import _ from 'lodash';
import database, { UNLIMITED } from '../../database/resources'
import * as fromStructures from "./structures";
import * as fromUpgrades from "./upgrades";

// Actions
export const CONSUME = 'resources/CONSUME';
export const PRODUCE = 'resources/PRODUCE';

// Initial State
const initialState = {
    byId: {
        minerals: {
            name: "Minerals",
            amount: 0
        },
        energy: {
            name: "Energy",
            amount: 100,
            capacity: {
                base: 100
            }
        }
    },
    visibleIds: ['energy', 'minerals']
}

// Reducer
export default function reducer(state = initialState, action) {
    const payload = action.payload;

    switch (action.type) {
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
        byId: mapObject(amounts, (resourceId, amount) => (
            { amount: { $apply: function(x) { return Math.min(x + amount, getCapacity(getResource(state, resourceId))); } } }
        ))
    });
}

// Action Creators
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
    if (resource.capacity === undefined) { return Infinity; }

    return getModifiedTotal(resource.capacity);
}

export function toString(amounts, emptyString = 'none') {
    if (Object.keys(amounts).length === 0) { return emptyString; }
    // return Object.entries(amounts).map(([k,v]) => `${k}: ${_.round(v, 1)}` ).join(', ')
    return Object.entries(amounts).map(([k,v]) => `${_.round(v, 1)}${k[0]}` ).join(', ')
}