import update from 'immutability-helper';
import {SAVE_FORMAT_VERSION} from "../../lib/save_version";
import * as fromLog from "./log";

export interface GameState {
    /** bumped when the save shape changes incompatibly (see lib/save_version.ts); mismatched saves are discarded */
    saveFormatVersion: number;
    gameSpeed: number;
    lastSavedAt: number | null;
    settingsModalOpen: boolean;
    autoSaveEnabled: boolean;
    visibleNavTabs: NavTab[];
    currentNavTab: NavTab;
    showStructureTabs: boolean;
    currentStructureTab: string;
    hoveredPoiId: string | null;
    showTerminal: boolean;
    shuttersOpen: boolean;
    showPlanetStatus: boolean;
    showResourceBar: boolean;
    showResourceRates: boolean;
    showResourceCapacities: boolean;
    showStructuresList: boolean;
    /** the signature ledger: how many operator authorizations have been granted (see recordAuthorization) */
    authorizations: number;
    endGameSequenceStarted: boolean;
    rapidlyRecalcEnergy: boolean;
    blockPointerEvents: boolean;
    burnOutside: boolean;
    hideUI: boolean;
    hideCanvas: boolean;
    gameOver: boolean;
    /** set by the ending cutscene (not in the initial state) */
    fadeToBlack?: boolean;
}

// Actions
export const UPDATE_SETTING = 'game/UPDATE_SETTING' as const;
export const ADD_NAV_TAB = 'game/ADD_NAV_TAB' as const;

export type GameSliceAction =
    | { type: typeof UPDATE_SETTING; payload: { key: keyof GameState; value: GameState[keyof GameState] } }
    | { type: typeof ADD_NAV_TAB; payload: { tab: NavTab } };

// Constants
export type NavTab = keyof typeof NAV_TAB_TITLES;
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

    // Every click is a human authorization the machine cannot forge; this counts the ones worth a receipt
    authorizations: 0,

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
    switch (action.type) {
        case UPDATE_SETTING:
            return update(state, {
                [action.payload.key]: { $set: action.payload.value }
            });
        case ADD_NAV_TAB:
            return update(state, {
                visibleNavTabs: { $push: [action.payload.tab] }
            });
        default:
            return state;
    }
}

export function updateSetting<K extends keyof GameState>(key: K, value: GameState[K]): GameSliceAction {
    return { type: UPDATE_SETTING, payload: { key, value } }
}

export function addNavTab(tab: NavTab): GameSliceAction {
    return { type: ADD_NAV_TAB, payload: { tab } }
}

/**
 * Counts an operator authorization and prints its ledger receipt ("AUTH 0004 BLAST SHIELD: GRANTED"). The label
 * is the short, uppercase name for the receipt; keep it brief, the terminal is 33 columns wide. Pass null to count
 * without printing (the boot sequence prints its own receipt as part of the boot text).
 */
export function recordAuthorization(label: string | null) {
    return (dispatch: Dispatch, getState: GetState) => {
        const number = getState().game.authorizations + 1;
        dispatch(updateSetting('authorizations', number));
        if (label !== null) {
            dispatch(fromLog.logMessage('authReceipt', { number: String(number).padStart(4, '0'), label }));
        }
    }
}


export function updateLastSavedAt(): GameSliceAction {
    return { type: UPDATE_SETTING, payload: { key: 'lastSavedAt', value: (new Date()).valueOf() } }
}
export function resetLastSavedAt(): GameSliceAction {
    return { type: UPDATE_SETTING, payload: { key: 'lastSavedAt', value: null } }
}
export function formattedLastSavedAt(state: GameState) {
    return state && state.lastSavedAt ? (new Date(state.lastSavedAt)).toLocaleString() : 'Never'
}