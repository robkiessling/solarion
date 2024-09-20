import update from 'immutability-helper';
import {recalculateState, withRecalculation} from "../reducer";
import {generateRandomProbeDist} from "../../lib/star";

// Actions
export const GENERATE_PROBE_DIST = 'star/GENERATE_PROBE_DIST';
export const UPDATE_SETTING = 'star/UPDATE_SETTING';

// Initial State
const initialState = {
    distribution: [],
    mirrorEnabled: false,
    mirrorTarget: null,
    mirrorAmount: 0,
}

// Reducer
export default function reducer(state = initialState, action) {
    const payload = action.payload;

    switch (action.type) {
        case GENERATE_PROBE_DIST:
            return update(state, {
                distribution: { $set: payload.distribution }
            })
        case UPDATE_SETTING:
            return update(state, {
                [payload.key]: { $set: payload.value }
            });
        default:
            return state;
    }
}


// Action Creators
export function generateProbeDist() {
    const distribution = generateRandomProbeDist();
    return { type: GENERATE_PROBE_DIST, payload: { distribution } };
}

export function updateSetting(key, value) {
    return { type: UPDATE_SETTING, payload: { key, value } }
}

