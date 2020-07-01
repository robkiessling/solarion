import update from 'immutability-helper';
import * as structures from './structures';

// Actions
export const CONSUME = 'resources/CONSUME';
export const GENERATE = 'resources/GENERATE';

// Initial State
const initialState = {
    order: ['minerals'],
    minerals: {
        amount: 100,
        rate: 5
    }
}

function applyCost(state, cost, multiplier) {
    let overrides = {}
    for (const [key, value] of Object.entries(cost)) {
        overrides[key] = { amount: { $apply: function(x) { return x - (value.base * multiplier); } } }
    }
    return update(state, overrides);
}

// Reducer
export default function reducer(state = initialState, action) {
    const payload = action.payload;

    switch (action.type) {
        case CONSUME:
            return update(state, {
                [payload.resourceKey]: { amount: { $apply: function(x) { return x - payload.amount; } } }
            });
        case GENERATE:
            return update(state, {
                [payload.resourceKey]: { amount: { $apply: function(x) { return x + payload.amount; } } }
            });
        case structures.BUILD:
            return applyCost(state, payload.cost, payload.amount);
        default:
            return state;
    }
}

// Action Creators
export function consume(resourceKey, amount) {
    return { type: CONSUME, payload: { resourceKey, amount } };
}
export function generate(resourceKey, amount) {
    return { type: GENERATE, payload: { resourceKey, amount } };
}