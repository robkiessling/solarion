import update from 'immutability-helper';
import {SAVE_FORMAT_VERSION} from "../../lib/save_version";

// Actions
export const UPDATE_SETTING = 'game/UPDATE_SETTING';
export const ADD_NAV_TAB = 'game/ADD_NAV_TAB';

// Constants
export const NAV_TAB_TITLES = {
    outside: 'Base',
    planet: 'Planet',
    star: 'Solarion',
}

const initialState: GameState = {
    saveFormatVersion: SAVE_FORMAT_VERSION,
    gameSpeed: 1,
    lastSavedAt: null,
    settingsModalOpen: false,
    autoSaveEnabled: false,

    visibleNavTabs: [],
    currentNavTab: 'outside',
    showStructureTabs: false,
    currentStructureTab: 'all',

    // Transient UI state: POI row being hovered in the expedition sidebar (highlights its map marker).
    // Lives here (not planet slice) because the Planet canvas and the sidebar share no common parent below App.
    hoveredPoiId: null,

    // introduction variables (unlocks various ui components as player goes thru intro)
    showTerminal: false,
    shuttersOpen: false,
    showPlanetStatus: false,
    showResourceBar: false,
    showResourceRates: false,
    showResourceCapacities: false, // todo
    showStructuresList: false,

    // end game variables
    endGameSequenceStarted: false,
    rapidlyRecalcEnergy: false,
    blockPointerEvents: false,
    burnOutside: false,
    hideUI: false,
    hideCanvas: false,
    gameOver: false,
}

// Reducers
export default function reducer(state: GameState = initialState, action: GameAction): GameState {
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

export function updateSetting(key: keyof GameState, value: any) {
    return { type: UPDATE_SETTING, payload: { key, value } }
}

export function addNavTab(tab: string) {
    return { type: ADD_NAV_TAB, payload: { tab } }
}


export function updateLastSavedAt() {
    return { type: UPDATE_SETTING, payload: { key: 'lastSavedAt', value: (new Date()).valueOf() } }
}
export function resetLastSavedAt() {
    return { type: UPDATE_SETTING, payload: { key: 'lastSavedAt', value: null } }
}
export function formattedLastSavedAt(state: GameState) {
    return state && state.lastSavedAt ? (new Date(state.lastSavedAt)).toLocaleString() : 'Never'
}