import update from 'immutability-helper';
import {mod} from "../../lib/helpers";

// Actions
export const UPDATE_SETTING = 'game/UPDATE_SETTING';
export const ADD_NAV_TAB = 'game/ADD_NAV_TAB';
export const CHANGE_TAB = 'game/CHANGE_TAB';

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
    currentNavTab: 'planet'
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
        case CHANGE_TAB:
            return update(state, {
                currentNavTab: { $set: getTabAtOffset(state, payload.offset) }
            })
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

export function prevTabId(state) {
    return getTabAtOffset(state, -1);
}

export function nextTabId(state) {
    return getTabAtOffset(state, 1);
}

export function goToPrevTab() {
    return { type: CHANGE_TAB, payload: { offset: -1 } }
}
export function goToNextTab() {
    return { type: CHANGE_TAB, payload: { offset: 1 } }
}

function getTabAtOffset(state, offset) {
    const currentTabIndex = state.visibleNavTabs.indexOf(state.currentNavTab);
    const numTabs = state.visibleNavTabs.length;
    const newIndex = mod(currentTabIndex + offset, numTabs);

    return state.visibleNavTabs[newIndex];
}
