import update from 'immutability-helper';

// Actions
export const CONSUME = 'resources/CONSUME';

// Initial State
const initialState = {
    order: ['minerals'],
    minerals: {
        amount: 1000,
        rate: 5
    }
}

// Reducer
export default function reducer(state = initialState, action) {
    switch (action.type) {
        case CONSUME:
            return update(state, {
                [action.payload.resourceKey]: { amount: { $apply: function(x) { return x - action.payload.amount; } } }
            });
        default:
            return state;
    }
}

// Action Creators
export function consume(resourceKey, amount) {
    return { type: CONSUME, payload: { resourceKey, amount } };
}