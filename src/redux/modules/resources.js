import update from 'immutability-helper';
import {mapObject} from "../../lib/helpers";
import database, {calculators} from '../../database/resources';
import * as fromStructures from "./structures";
import * as fromUpgrades from "./upgrades";
import {withRecalculation} from "../reducer";

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
            return consumeReducer(state, fromStructures.getBuildCost(payload.structure));
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
    return withRecalculation({ type: LEARN, payload: { id } });
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
    if (!resource) {
        return 0;
    }
    return resource.amount;
}
export function getCapacity(resource) {
    return resource.capacity;
}
export function getIcon(id) {
    return database[id].icon;
}

/**
 * @param state Refers to the full state (unlike other methods which already refer to the resources slice)
 * @returns {*} Overrides to update various structure values
 */
export function calculations(state) {
    return mapObject(state.resources.byId, (resourceId, resource) => {
        if (!calculators[resourceId]) { return {}; }

        return mapObject(calculators[resourceId], (attr, calculator) => {
            return { $set: calculator(state, resource) };
        });
    });
}
