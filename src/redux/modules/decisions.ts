import update from 'immutability-helper';
import {batch} from 'react-redux';
import database, {type DecisionId, type DecisionOption, type DecisionRecord} from '../../database/base/decisions';
import * as fromLog from './log';
import * as fromUpgrades from './upgrades';
import * as fromResources from './resources';
import * as fromPanels from './panels';
import {rearmTrigger} from './triggers';
import upgradesDatabase from '../../database/base/upgrades';
import type {TriggerId} from '../../database/triggers';

// Ids in the state are plain strings (DecisionId in practice): typing them would make the decisions and triggers
// tables circular for any trigger that reads this state (e.g. to scale a re-ask threshold by resolvedCount).

// The table is looked up through this so an empty table (DecisionId = never) still types; the ids come from the
// table's own keys, so a miss can't happen.
function getRecord(id: DecisionId): DecisionRecord {
    return (database as Record<string, DecisionRecord>)[id];
}
export interface DecisionsState {
    /** the decision showing in the popup */
    openId: string | null;
    /** requests waiting on the operator, oldest first; `seen` once the popup has been opened for it */
    pending: { id: string; seen: boolean }[];
    /** per decision, how many times an option has been chosen; wall triggers scale their re-ask thresholds by it */
    resolvedCount: { [decisionId: string]: number };
}

// Actions
export const REQUEST_DECISION = 'decisions/REQUEST' as const;
export const OPEN_DECISION = 'decisions/OPEN' as const;
export const CLOSE_DECISION = 'decisions/CLOSE' as const;
export const RESOLVE_DECISION = 'decisions/RESOLVE' as const;

export type DecisionsAction =
    | { type: typeof REQUEST_DECISION; payload: { id: DecisionId } }
    | { type: typeof OPEN_DECISION; payload: { id: DecisionId } }
    | { type: typeof CLOSE_DECISION }
    | { type: typeof RESOLVE_DECISION; payload: { id: DecisionId } };

const initialState: DecisionsState = {
    openId: null,
    pending: [],
    resolvedCount: {}
};

export default function reducer(state: DecisionsState = initialState, action: GameAction): DecisionsState {
    switch (action.type) {
        case REQUEST_DECISION:
            if (state.pending.some(entry => entry.id === action.payload.id)) return state;
            return update(state, { pending: { $push: [{ id: action.payload.id, seen: false }] } });
        case OPEN_DECISION:
            return update(state, {
                openId: { $set: action.payload.id },
                pending: { $set: state.pending.map(entry => entry.id === action.payload.id ? { ...entry, seen: true } : entry) }
            });
        case CLOSE_DECISION:
            return update(state, { openId: { $set: null } });
        case RESOLVE_DECISION:
            return update(state, {
                openId: { $set: null },
                pending: { $set: state.pending.filter(entry => entry.id !== action.payload.id) },
                resolvedCount: { [action.payload.id]: { $set: (state.resolvedCount[action.payload.id] ?? 0) + 1 } }
            });
        default:
            return state;
    }
}

// Action Creators

/**
 * Puts a request on the operator's desk: a marked row on the owning structure's card. Nothing opens. Skipped if the
 * decision is already pending or has nothing left to ask (every option hidden, e.g. both remedies of a wall taken).
 * This is what triggers call.
 */
export function requestDecision(id: DecisionId) {
    return (dispatch: Dispatch, getState: GetState) => {
        const state = getState();
        if (state.decisions.pending.some(entry => entry.id === id)) return;
        if (visibleOptions(state, getRecord(id)).length === 0) return;
        dispatch({ type: REQUEST_DECISION, payload: { id } });
    }
}

/** Shows a decision in the popup (the row click; also how a chained scene opens its next decision directly) */
export function openDecision(id: DecisionId): DecisionsAction {
    return { type: OPEN_DECISION, payload: { id } };
}

/** Close / ✕: closes the popup without answering; the request stays pending */
export function closeDecision(): DecisionsAction {
    return { type: CLOSE_DECISION };
}

/** Picks option `index` of the open decision's visible options: runs its action, prints its log, resolves, re-arms */
export function chooseOption(index: number) {
    return (dispatch: Dispatch, getState: GetState) => {
        const state = getState();
        const id = state.decisions.openId as DecisionId | null;
        if (!id) return;
        const record = getRecord(id);
        const option = visibleOptions(state, record)[index];
        if (!option || !isAvailable(state, option)) return;

        batch(() => {
            if (option.research) {
                // Discover then research: the option is the click that spends the resources (isAvailable already
                // checked the cost is in hand); the structure card shows the progress from here
                dispatch(fromUpgrades.discover(option.research));
                const upgrade = fromUpgrades.getUpgrade(getState().upgrades, option.research);
                if (upgrade) dispatch(fromUpgrades.researchUnsafe(upgrade));
            }
            option.action?.(dispatch);
            if (option.receipt) {
                dispatch(fromPanels.recordAuthorization(option.receipt));
            }
            if (option.log) {
                dispatch(fromLog.startLogSequence(option.log));
            }
            dispatch({ type: RESOLVE_DECISION, payload: { id } });
            if (record.rearm) {
                dispatch(rearmTrigger(record.rearm as TriggerId));
            }
        });
    }
}

// Standard Functions

/** The record's options minus hidden ones; a research option is hidden once its research has been offered */
export function visibleOptions(state: RootState, record: DecisionRecord): DecisionOption[] {
    return record.options.filter(option => {
        if (option.hidden?.(state)) return false;
        if (option.research) {
            const upgrade = fromUpgrades.getUpgrade(state.upgrades, option.research);
            if (upgrade && upgrade.state !== 'hidden') return false;
        }
        return true;
    });
}
/** Whether the option can be chosen now; a research option needs its cost in hand */
export function isAvailable(state: RootState, option: DecisionOption): boolean {
    if (option.available && !option.available(state)) return false;
    if (option.research && !fromResources.canConsume(state.resources, researchCost(option))) return false;
    return true;
}
/** A research option's cost, from the database record (the upgrade isn't in the state until chosen) */
export function researchCost(option: DecisionOption): ResourceAmounts {
    return option.research ? upgradesDatabase[option.research].cost : {};
}
export function researchTime(option: DecisionOption): number {
    return option.research ? upgradesDatabase[option.research].researchTime : 0;
}
export function bodyLines(state: RootState, record: DecisionRecord): string[] {
    return typeof record.body === 'function' ? record.body(state) : record.body;
}
/** The pending requests whose row belongs on this structure's card */
export function pendingForStructure(state: DecisionsState, structureId: StructureId) {
    return state.pending.filter(entry => getRecord(entry.id as DecisionId).structure === structureId);
}
