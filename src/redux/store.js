
import { createStore, applyMiddleware, compose } from 'redux';
import thunk from 'redux-thunk';
import reducer from './reducer';


const middleware = [ thunk ];
// if (process.env.NODE_ENV !== 'production') {
//     middleware.push(createLogger());
// }

/*__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ is for https://github.com/zalmoxisus/redux-devtools-extension#usage */
const composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose;

export default createStore(
    reducer,
    /* preloadedState, */
    composeEnhancers(
        applyMiddleware(...middleware)
    )
);
