import {applyMiddleware, compose, createStore} from 'redux';
import thunk from 'redux-thunk';
import reducer from './reducer';
import {batchedSubscribe} from 'redux-batched-subscribe';
import {debounce, throttle} from 'lodash';
import {loadState, resetState, saveState} from "../lib/local_storage";

const AUTO_SAVE_INTERVAL = 30 * 1000;

const middleware = [ thunk ];
// if (process.env.NODE_ENV !== 'production') {
//     middleware.push(createLogger());
// }

/*__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ is for https://github.com/zalmoxisus/redux-devtools-extension#usage */
const composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose;

const enhancer = composeEnhancers(
    applyMiddleware(...middleware),
    batchedSubscribe(debounce(notify => notify()))
)

// resetState();
const persistedState = loadState();

const store = createStore(
    reducer,
    persistedState,
    enhancer
);

store.subscribe(throttle(() => {
    /* Example saving a partial state: */
    // saveState({
    //     todos: store.getState().todos
    // })

    const state = store.getState();

    if (state && state.game && state.game.endGameSequenceStarted) {
        // Do not auto-save if we're in the end game sequence
        return;
    }

    saveState(store.getState());
}, AUTO_SAVE_INTERVAL));

export default store;