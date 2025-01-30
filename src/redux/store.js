import {applyMiddleware, compose, createStore} from 'redux';
import thunk from 'redux-thunk';
import reducer from './reducer';
import {batchedSubscribe} from 'redux-batched-subscribe';
import {debounce, throttle} from 'lodash';
import {loadState, saveState} from "../lib/local_storage";

export const AUTO_SAVE_INTERVAL = 30 * 1000; // 30 seconds

const middleware = [ thunk ];

/*__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ is for https://github.com/zalmoxisus/redux-devtools-extension#usage */
const composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose;

const enhancer = composeEnhancers(
    applyMiddleware(...middleware),
    batchedSubscribe(debounce(notify => notify()))
)

const store = createStore(
    reducer,
    loadState(),
    enhancer
);

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

function readSetting(state, setting) {
    return state && state.game && state.game[setting];
}

export default store;