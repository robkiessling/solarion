import store from '../store';
import update from "immutability-helper";
import database from '../../database/triggers';

export const ADD_TRIGGER = 'triggers/ADD_TRIGGER' as const;
export const REMOVE_TRIGGER = 'triggers/REMOVE_TRIGGER' as const;

export type TriggersAction =
    | { type: typeof ADD_TRIGGER; payload: { id: string } }
    | { type: typeof REMOVE_TRIGGER; payload: { id: string } };

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

export function addTrigger(id: string) {
    return (dispatch: Dispatch, getState: GetState) => {
        if (!isTriggered(getState().triggers, id)) {
            dispatch({ type: ADD_TRIGGER, payload: { id } })
            syncTriggers(getState().triggers);
        }
    }
}

function isPending(state: TriggersState, id: string) {
    return state.byId[id] && !state.byId[id].triggered;
}
function isTriggered(state: TriggersState, id: string) {
    return state.byId[id] && state.byId[id].triggered;
}

// todo explain this process better (syncTriggers is similar to a react component)

export function syncTriggers(state: TriggersState) {
    for (const id of Object.keys(state.byId)) {
        if (isPending(state, id) && !activeTriggers[id]) {
            const dbRecord = database[id];

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