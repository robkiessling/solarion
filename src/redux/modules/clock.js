import update from 'immutability-helper';

// Actions
export const TICK = 'clock/TICK';

// Initial State
const initialState = {
    elapsedTime: 0,
}

// Reducer
export default function reducer(state = initialState, action) {
    switch (action.type) {
        case TICK:
            return update(state, {
                elapsedTime: { $apply: function(x) { return x + action.payload.timeDelta; } }
            });
        default:
            return state;
    }
}

// Action Creators
export function tick(timeDelta) {
    return { type: TICK, payload: { timeDelta } };
}