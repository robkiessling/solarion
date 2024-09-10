import update from 'immutability-helper';
import {recalculateState, withRecalculation} from "../reducer";
import {generateRandomProbeDist} from "../../lib/star";

// Actions
export const GENERATE_PROBE_DIST = 'planet/GENERATE_PROBE_DIST';

// Initial State
const initialState = {
    distribution: []
}

// Reducer
export default function reducer(state = initialState, action) {
    const payload = action.payload;

    switch (action.type) {
        case GENERATE_PROBE_DIST:
            return update(state, {
                distribution: { $set: payload.distribution }
            })
        default:
            return state;
    }
}


// Action Creators
export function generateProbeDist() {
    const distribution = generateRandomProbeDist();
    return { type: GENERATE_PROBE_DIST, payload: { distribution } };
}

