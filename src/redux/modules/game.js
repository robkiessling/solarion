import update from 'immutability-helper';
import {mod} from "../../lib/helpers";

// Actions
export const UPDATE_SETTING = 'game/UPDATE_SETTING';
export const ADD_NAV_TAB = 'game/ADD_NAV_TAB';

// Constants
export const NAV_TAB_TITLES = {
    outside: 'Surface',
    planet: 'Globe',
    star: 'Solarion',
}

const initialState = {
    gameSpeed: 1,

    showTerminal: false,
    shuttersOpen: false,
    showPlanetStatus: false,
    showResourceBar: true,
    showResourceRates: false,
    showNonCCBuildings: false, // This setting is just so we can show the harvester outside for a few secs before it shows up in structures
    visibleNavTabs: [],
    currentNavTab: 'outside',

    showStructureTabs: false,
    currentStructureTab: 'all',

    // end game variables
    rapidlyRecalcEnergy: false,
    blockPointerEvents: false,
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
