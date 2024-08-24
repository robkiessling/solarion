import update from 'immutability-helper';
import {recalculateState, withRecalculation} from "../reducer";
import {batch} from "react-redux";
import database from "../../database/upgrades";

// Actions
export const UPDATE_SETTING = 'game/UPDATE_SETTING';
export const ADD_NAV_TAB = 'game/ADD_NAV_TAB';

// Constants
export const NAV_TAB_TITLES = {
    planet: 'Planet',
    technology: 'Technology',
    solarion: 'Solarion'
}

// Initial State
const initialState = {
    windowOpen: false,
    showPlanetStatus: false,
    showResourceBar: false,
    visibleNavTabs: [],
    currentNavTab: 'planet',
}

// Reducers
export default function reducer(state = initialState, action) {
    const payload = action.payload;

    switch (action.type) {
        case UPDATE_SETTING:
            return update(state, {
                [payload.key]: { $set: payload.value }
            });
        case ADD_NAV_TAB:
            return update(state, {
                visibleNavTabs: { $push: [payload.tab] },
                // currentNavTab: { $apply: tab => tab === null ? payload.tab : tab }
            });
        default:
            return state;
    }
}

export function updateSetting(key, value) {
    return { type: UPDATE_SETTING, payload: { key, value } }
}

export function addNavTab(tab) {
    return { type: ADD_NAV_TAB, payload: { tab } }
}
