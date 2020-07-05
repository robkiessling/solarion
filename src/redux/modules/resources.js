import update from 'immutability-helper';
// import * as structures from './structures';

// Actions
export const CONSUME = 'resources/CONSUME';
export const GENERATE = 'resources/GENERATE';

// Initial State
const initialState = {
    byId: {
        minerals: {
            amount: 100,
            rate: 5
        }
    },
    visibleIds: ['minerals']
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
                byId: { [payload.id]: { amount: { $apply: function(x) { return x - payload.amount; } } } }
            });
        case GENERATE:
            return update(state, {
                byId: { [payload.id]: { amount: { $apply: function(x) { return x + payload.amount; } } } }
            });
        default:
            return state;
    }
}

// Action Creators
export function consume(id, amount) {
    return function(dispatch, getState) {
        if (canConsume(getState(), id, amount)) {
            dispatch(consumeUnsafe(id, amount));
        }
    }
}
export function consumeUnsafe(id, amount) {
    return { type: CONSUME, payload: { id, amount } };
}

export function generate(id, amount) {
    return { type: GENERATE, payload: { id, amount } };
}

// Standard Functions
export function getResource(state, id) {
    return state.resources.byId[id];
}
export function canConsume(state, id, amount) {
    return getQuantity(state, id) >= amount;
}
export function getQuantity(state, id) {
    return getResource(state, id).amount;
}