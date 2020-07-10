import React from 'react';
import ReactDOM from 'react-dom';

import { Provider } from 'react-redux';
import store from './redux/store';

import App from './components/app';
import './styles/app.scss';

// Note: These imports are required; they actually initialize the singletons
import gameClock from "./singletons/game_clock"
import resourceManager from "./singletons/resource_manager"

// window.store = store;
// const unsubscribe = store.subscribe(() => console.log('subscribed event: ', store.getState()));

import {build, learn} from './redux/modules/structures';

// store.dispatch(learn('commandCenter'));
// store.dispatch(build('commandCenter', 1));

store.dispatch(learn('mineralHarvester'));
store.dispatch(build('mineralHarvester', 1));
// store.dispatch(learn('solarPanel'));

ReactDOM.render(
    <Provider store={store}>
        <App />
    </Provider>,
    document.getElementById('app')
);