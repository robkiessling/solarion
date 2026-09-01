import update from 'immutability-helper';
import {batch} from "react-redux";
import {CHASSIS_ROWS_BY_ID, getChassisOption} from "../../database/chassis";
import {canConsume, consumeUnsafe} from "./resources";
import {logInline} from "./log";
import {initOperations, mergeEffectIntoOperations, applyOperationsToVariables} from "../../lib/effect";

/**
 * Special upgrade panels: full-screen popups owned by a structure, each with its own bespoke UI
 * and content database (vs. the generic one-button upgrades on structure cards). First panel is
 * the droid factory's schematic index ('chassis', database/chassis.js). Future panels (e.g. a
 * solar circuitry board) add: a content database, a component registered in
 * components/panels/panel_host.jsx, their own state key + action handling below, and an opener
 * button on their structure's card. openPanelId / authorizationCount are shared machinery.
 *
 * Authorization numbers: one global counter across all panels — every signed authorization gets
 * the next number (the terminal quotes these back late-game). Seeded past the pre-war entries.
 */

// Actions
export const OPEN_PANEL = 'panels/OPEN_PANEL';
export const CLOSE_PANEL = 'panels/CLOSE_PANEL';
export const CHASSIS_AUTHORIZE = 'panels/CHASSIS_AUTHORIZE'; // start (or instantly finish) a retool
export const CHASSIS_TICK = 'panels/CHASSIS_TICK';
export const CHASSIS_COMMIT = 'panels/CHASSIS_COMMIT';
export const CHASSIS_UNLOCK_ROW = 'panels/CHASSIS_UNLOCK_ROW';

// Initial State
const initialState = {
    openPanelId: null, // which special panel is showing (cleared on save load)
    authorizationCount: 311, // last used authorization number (Mk.1 FRAME carries #311 pre-war)
    chassis: {
        unlocked: [], // rowIds opened via unlockChassisRow (rows with unlock:'start' need no entry)
        authorized: {}, // rowId -> { optionId, authNumber }
        retooling: null, // { rowId, optionId, remainingMs, totalMs } — factory busy while set
        seenRowIds: [], // unlocked rows the player has seen in the panel (drives the "new" indicator)
    },
};

// Reducer
export default function reducer(state = initialState, action) {
    const payload = action.payload;

    switch (action.type) {
        case OPEN_PANEL: {
            const next = update(state, { openPanelId: { $set: payload.panelId } });
            if (payload.panelId !== 'chassis') return next;
            // Opening the index marks every currently unlocked row as seen (clears the "new" indicator)
            const visibleIds = Object.values(CHASSIS_ROWS_BY_ID)
                .filter(row => isChassisRowUnlocked(next, row))
                .map(row => row.id);
            return update(next, { chassis: { seenRowIds: { $set: visibleIds } } });
        }
        case CLOSE_PANEL:
            return update(state, { openPanelId: { $set: null } });
        case CHASSIS_AUTHORIZE:
            return update(state, {
                chassis: {
                    retooling: {
                        $set: {
                            rowId: payload.rowId,
                            optionId: payload.optionId,
                            remainingMs: payload.downtimeMs,
                            totalMs: payload.downtimeMs,
                        }
                    }
                }
            });
        case CHASSIS_TICK: {
            if (!state.chassis.retooling) return state;
            return update(state, {
                chassis: {
                    retooling: {
                        remainingMs: { $apply: (ms) => ms - payload.timeDelta }
                    }
                }
            });
        }
        case CHASSIS_COMMIT: {
            const retooling = state.chassis.retooling;
            if (!retooling) return state;
            const authNumber = state.authorizationCount + 1;
            return update(state, {
                authorizationCount: { $set: authNumber },
                chassis: {
                    retooling: { $set: null },
                    authorized: {
                        [retooling.rowId]: { $set: { optionId: retooling.optionId, authNumber } }
                    }
                }
            });
        }
        case CHASSIS_UNLOCK_ROW:
            if (state.chassis.unlocked.includes(payload.rowId)) return state;
            return update(state, { chassis: { unlocked: { $push: [payload.rowId] } } });
        default:
            return state;
    }
}

// Action Creators
export function openPanel(panelId) {
    return { type: OPEN_PANEL, payload: { panelId } };
}
export function closePanel() {
    return { type: CLOSE_PANEL };
}

// Opens a locked schematic row (site fragments / story triggers / dev call this).
export function unlockChassisRow(rowId) {
    return { type: CHASSIS_UNLOCK_ROW, payload: { rowId } };
}

/** @param {PanelsState} panelsState @param {ChassisRow} row @returns {boolean} */
export function isChassisRowUnlocked(panelsState, row) {
    return !!(row.preAuthorized || row.unlock === 'start' || panelsState.chassis.unlocked.includes(row.id));
}

// The active (signed) option of a row, folding in pre-war authorizations from the database.
export function getAuthorizedRecord(panelsState, row) {
    if (panelsState.chassis.authorized[row.id]) return panelsState.chassis.authorized[row.id];
    if (row.preAuthorized && row.options.length > 0) {
        return { optionId: row.options[0].id, authNumber: row.preAuthorized };
    }
    return null;
}

export function canAuthorizeChassis(state, rowId, optionId) {
    const row = CHASSIS_ROWS_BY_ID[rowId];
    const option = getChassisOption(rowId, optionId);
    if (!row || !option) return false;
    if (!isChassisRowUnlocked(state.panels, row)) return false;
    if (state.panels.chassis.retooling) return false; // factory busy
    const active = getAuthorizedRecord(state.panels, row);
    if (active && active.optionId === optionId) return false; // already running this spec
    return canConsume(state.resources, option.cost || {});
}

// Sign an option: pay its cost and start the factory downtime (instant when downtime is 0).
// On a row that's already authorized this IS the retool — same cost, same downtime, new spec.
export function authorizeChassis(rowId, optionId) {
    return (dispatch, getState) => {
        if (!canAuthorizeChassis(getState(), rowId, optionId)) return;
        const option = getChassisOption(rowId, optionId);
        const downtimeMs = (option.downtime || 0) * 1000;
        batch(() => {
            if (option.cost) dispatch(consumeUnsafe(option.cost));
            dispatch({ type: CHASSIS_AUTHORIZE, payload: { rowId, optionId, downtimeMs } });
            if (downtimeMs <= 0) {
                dispatch({ type: CHASSIS_COMMIT });
                logAuthorization(dispatch, getState, rowId);
            }
        });
    };
}

// Advances factory downtime (called from the game clock's summable tick group).
export function panelsTick(timeDelta) {
    return (dispatch, getState) => {
        if (!getState().panels.chassis.retooling) return;
        batch(() => {
            dispatch({ type: CHASSIS_TICK, payload: { timeDelta } });
            const retooling = getState().panels.chassis.retooling;
            if (retooling && retooling.remainingMs <= 0) {
                dispatch({ type: CHASSIS_COMMIT });
                logAuthorization(dispatch, getState, retooling.rowId);
            }
        });
    };
}

function logAuthorization(dispatch, getState, rowId) {
    const record = getState().panels.chassis.authorized[rowId];
    if (!record) return;
    const option = getChassisOption(rowId, record.optionId);
    dispatch(logInline(`Schematic authorized — ${option.name}. Authorization #${record.authNumber}. Refits apply to the next deployed squad.`));
}

// Whether the SCHEMATIC INDEX opener should draw attention: a row arrived the player hasn't seen
// yet (even if unaffordable — they should learn the index grew; clears on open), or an unsigned
// row is actionable right now (unlocked + affordable + factory idle; goes dark when it isn't, so
// it never nags forever). Deliberately ignores retools of already-signed forks — those would keep
// it lit for the rest of the game.
export function chassisNeedsAttention(state) {
    return Object.values(CHASSIS_ROWS_BY_ID).some(row => {
        if (!isChassisRowUnlocked(state.panels, row)) return false;
        if (!state.panels.chassis.seenRowIds.includes(row.id)) return true; // new arrival
        if (getAuthorizedRecord(state.panels, row)) return false; // signed; retools don't nag
        return row.options.some(option => canAuthorizeChassis(state, row.id, option.id));
    });
}

// Folds every authorized chassis option's effect into `variables`, in place — but only for
// variables the caller's block actually has (so a batteryCapacity effect can't smear NaN onto a
// droid stat block and vice versa). getDroidStats / getBatteryCapacity call this.
/** @param {PanelsState} panelsState @param {Variables} variables */
export function applyChassisEffects(panelsState, variables) {
    const operations = initOperations();
    Object.values(CHASSIS_ROWS_BY_ID).forEach(row => {
        const record = getAuthorizedRecord(panelsState, row);
        if (!record) return;
        const option = getChassisOption(row.id, record.optionId);
        if (option && option.effect) mergeEffectIntoOperations(option.effect, operations);
    });
    operations.add = operations.add.filter(op => op.variable in variables);
    operations.multiply = operations.multiply.filter(op => op.variable in variables);
    applyOperationsToVariables(operations, variables);
}
