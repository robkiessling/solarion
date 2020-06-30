
import { createStore, combineReducers } from 'redux';
import resources from './modules/resources';

const reducer = combineReducers({
    resources
});

// __REDUX_DEVTOOLS_EXTENSION__ is for https://github.com/zalmoxisus/redux-devtools-extension#usage
export default createStore(reducer, /* preloadedState, */ window.__REDUX_DEVTOOLS_EXTENSION__ && window.__REDUX_DEVTOOLS_EXTENSION__());
