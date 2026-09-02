import store from '../store';
import update from "immutability-helper";
import database, {type TriggerId, type TriggerRecord} from '../../database/triggers';
import {typedKeys} from '../../lib/helpers';

export interface TriggersState {
    byId: Partial<Record<TriggerId, { id: TriggerId; triggered: boolean }>>;
}

export const ADD_TRIGGER = 'triggers/ADD_TRIGGER' as const;
export const REMOVE_TRIGGER = 'triggers/REMOVE_TRIGGER' as const;

export type TriggersAction =
    | { type: typeof ADD_TRIGGER; payload: { id: TriggerId } }
    | { type: typeof REMOVE_TRIGGER; payload: { id: TriggerId } };

const initialState: TriggersState = {
    byId: {},
}

export default function reducer(state: TriggersState = initialState, action: GameAction): TriggersState {
    switch(action.type) {
        case ADD_TRIGGER:
            return update(state, {
                byId: {
                    [action.payload.id]: {
                        $set: {
                            id: action.payload.id,
                            triggered: false
                        }
                    }
                }
            });
        case REMOVE_TRIGGER:
            return update(state, {
                byId: {
                    [action.payload.id]: {
                        $set: {
                            id: action.payload.id,
                            triggered: true
                        }
                    }
                }
            })
        default:
            return state;
    }
}

export function addTrigger(id: TriggerId) {
    return (dispatch: Dispatch, getState: GetState) => {
        if (!isTriggered(getState().triggers, id)) {
            dispatch({ type: ADD_TRIGGER, payload: { id } })
            syncTriggers(getState().triggers);
        }
    }
}

function isPending(state: TriggersState, id: TriggerId) {
    return state.byId[id] && !state.byId[id].triggered;
}
function isTriggered(state: TriggersState, id: TriggerId) {
    return state.byId[id] && state.byId[id].triggered;
}

// todo explain this process better (syncTriggers is similar to a react component)

export function syncTriggers(state: TriggersState) {
    for (const id of typedKeys(state.byId)) {
        if (isPending(state, id) && !activeTriggers[id]) {
            const dbRecord: TriggerRecord = database[id]; // any-sliced: the entries' slice types differ (see trigger() in the table)

            activeTriggers[id] = observeStore(store, dbRecord.selector, (state, unsubscribe) => {
                if (dbRecord.condition(state)) {
                    dbRecord.action();
                    unsubscribe();
                    delete activeTriggers[id]
                    store.dispatch({ type: REMOVE_TRIGGER, payload: { id } })
                }
            });
        }
    }
}

// Keeps track of subscriptions that are actually loaded
// This variable will not persist through localStorage save state; after loading a saved state you need to call
// syncTriggers to populate this variable.
const activeTriggers: Record<string, () => void> = {};


// Subscribes to changes to a specific part of the store (specified by the `selector` parameter function).
// Taken from: https://github.com/reduxjs/redux/issues/303#issuecomment-125184409
function observeStore<S>(store: { getState: () => RootState, subscribe: (listener: () => void) => () => void }, selector: (state: RootState) => S, onChange: (slice: S, unsubscribe: () => void) => void) {
    let currentState: S | undefined;

    function handleChange() {
        let nextState = selector(store.getState());
        if (nextState !== currentState) {
            currentState = nextState;
            onChange(currentState, unsubscribe);
        }
    }

    let unsubscribe = store.subscribe(handleChange);
    handleChange();
    return unsubscribe;
}