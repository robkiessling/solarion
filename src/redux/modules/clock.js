import update from 'immutability-helper';

// Actions
export const TICK = 'clock/TICK';

// Initial State
const initialState = {
    elapsedTime: 0,
    dayLength: 60 * 10, // 10 minutes

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


export function percentOfDay(state) {
    const secondsIntoDay = state.clock.elapsedTime % state.clock.dayLength;
    return secondsIntoDay / state.clock.dayLength;
}
export function formattedTOD(state) {

}