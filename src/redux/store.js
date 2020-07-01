
import { createStore, combineReducers } from 'redux';
import clock from './modules/clock'
import resources from './modules/resources';
import structures from "./modules/structures";

const reducer = combineReducers({
    clock,
    resources,
    structures
});

/*__REDUX_DEVTOOLS_EXTENSION__ is for https://github.com/zalmoxisus/redux-devtools-extension#usage */
export default createStore(reducer, /* preloadedState, */ window.__REDUX_DEVTOOLS_EXTENSION__ && window.__REDUX_DEVTOOLS_EXTENSION__());
