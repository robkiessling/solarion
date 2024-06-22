import update from 'immutability-helper';
import {recalculateState, withRecalculation} from "../reducer";
import {batch} from "react-redux";
import database from "../../database/upgrades";

// Actions
export const UPDATE_SETTING = 'game/UPDATE_SETTING';

// Initial State
const initialState = {
    windowOpen: false,
    showPlanetStatus: false,
    showResourceBar: false
}

// Reducers
export default function reducer(state = initialState, action) {
    const payload = action.payload;

    switch (action.type) {
        case UPDATE_SETTING:
            return update(state, {
                [payload.key]: { $set: payload.value }
            });
        default:
            return state;
    }
}

export function updateSetting(key, value) {
    return { type: UPDATE_SETTING, payload: { key, value } }
}