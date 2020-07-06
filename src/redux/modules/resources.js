import update from 'immutability-helper';
import {mapObject} from "../../lib/helpers";
import _ from 'lodash';

// Actions
export const CONSUME = 'resources/CONSUME';
export const PRODUCE = 'resources/PRODUCE';

// Initial State
const initialState = {
    byId: {
        minerals: {
            name: "Minerals",
            amount: 100
        },
        energy: {
            name: "Energy",
            amount: 0
        }
    },
    visibleIds: ['energy', 'minerals']
}

// const byId = (state = initialState.byId, action) => {
//     switch (action.type) {
//         default:
//             return state;
//     }
// }

// function applyCost(state, cost, multiplier) {
//     let overrides = { byId: {} }
//     for (const [key, value] of Object.entries(cost)) {
//         overrides.byId[key] = { amount: { $apply: function(x) { return x - (value.base * multiplier); } } }
//     }
//     return update(state, overrides);
// }

// Reducer
export default function reducer(state = initialState, action) {
    const payload = action.payload;

    switch (action.type) {
        case CONSUME:
            return update(state, {
                byId: mapObject(payload.amounts, (k, v) => ({ amount: { $apply: function(x) { return x - v; } } }))
            });
        case PRODUCE:
            return update(state, {
                byId: mapObject(payload.amounts, (k, v) => ({ amount: { $apply: function(x) { return x + v; } } }))
            });
        default:
            return state;
    }
}

// Action Creators
export function consume(amounts) {
    return function(dispatch, getState) {
        if (canConsume(getState(), amounts)) {
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
    return state.resources.byId[id];
}
export function canConsume(state, amounts) {
    return Object.entries(amounts).every(([k,v]) => getQuantity(state, k) >= v);
}
export function getQuantity(state, id) {
    return getResource(state, id).amount;
}

export function toString(amounts) {
    return Object.entries(amounts).map(([k,v]) => `${k}: ${_.round(v, 1)}` ).join(', ')
}