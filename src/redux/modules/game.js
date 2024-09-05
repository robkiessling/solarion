import update from 'immutability-helper';
import {mod} from "../../lib/helpers";

// Actions
export const UPDATE_SETTING = 'game/UPDATE_SETTING';
export const ADD_NAV_TAB = 'game/ADD_NAV_TAB';

// Constants
export const NAV_TAB_TITLES = {
    outside: 'Surface',
    technology: 'Technology',
    planet: 'Planet',
    solarion: 'Solarion',
}

// Initial State
const initialState = {
    windowOpen: false,
    showPlanetStatus: false,
    showResourceBar: false,
    visibleNavTabs: [],
    currentNavTab: 'planet',

    showStructureTabs: true,
    currentStructureTab: 'all',
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
                visibleNavTabs: { $push: [payload.tab] }
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
