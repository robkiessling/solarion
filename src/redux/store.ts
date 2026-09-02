import {applyMiddleware, compose, createStore, Store} from 'redux';
import thunk from 'redux-thunk';
import reducer from './reducer';
import {batchedSubscribe} from 'redux-batched-subscribe';
import {debounce, throttle} from 'lodash';
import {loadState, saveState} from "../lib/local_storage";
import {migrateSavedState} from "../lib/save_migration";
import type {GameState} from './modules/game';

export const AUTO_SAVE_INTERVAL = 30 * 1000; // 30 seconds

const middleware = [ thunk ];

/*__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ is for https://github.com/zalmoxisus/redux-devtools-extension#usage */
const composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose;

const enhancer = composeEnhancers(
    applyMiddleware(...middleware),
    batchedSubscribe(debounce(notify => notify()))
)

// Saves from older versions of the game may be missing newer state fields; migrate them over the
// current default state instead of loading them raw (which crashes or silently freezes the game).
const defaultState = reducer(undefined, { type: '@@INIT' } as unknown as GameAction); // redux's own init action, not a game action

// Thunk middleware widens dispatch to accept functions; the loose Dispatch type reflects that
const store = createStore(
    reducer,
    migrateSavedState(loadState(), defaultState),
    enhancer
) as unknown as Omit<Store<RootState, GameAction>, 'dispatch'> & { dispatch: Dispatch };

store.subscribe(throttle(() => {
    const state = store.getState();

    if (!readSetting(state, 'autoSaveEnabled')) {
        return;
    }

    if (readSetting(state, 'endGameSequenceStarted')) {
        return; // do not auto-save if we're in the end game sequence
    }

    saveState(state);
}, AUTO_SAVE_INTERVAL));

function readSetting(state: RootState, setting: keyof GameState) {
    return state && state.game && state.game[setting];
}

// Dev-console access to the live store (debugging / driving the sim by hand); stripped from prod builds.
// solarionBattle exposes the battle factory so e2e scripts can stage arbitrary fights via SQUAD_START_FIGHT.
if (import.meta.env.DEV) {
    window.solarionStore = store;
    import('../lib/battle').then(battle => { window.solarionBattle = battle; });
}

export default store;