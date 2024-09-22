import React from 'react';
import ReactDOM from 'react-dom';

import { Provider } from 'react-redux';
import _ from 'lodash'; // Creates global lodash variable
import store from './redux/store';

import App from './components/app';
import './styles/app.scss';

// Note: Singleton imports are necessary despite not being used in this file; they initialize the singletons
import gameClock from "./singletons/game_clock"

import {hasStartedGame, startLogSequence} from "./redux/modules/log";
import {syncTriggers} from "./redux/modules/triggers";


if (hasStartedGame(store.getState().log)) {
    // initialize store subscriptions from previous saved state
    syncTriggers(store.getState().triggers)
} else {
    // fresh start!
    store.dispatch(startLogSequence('startup'));
}

ReactDOM.render(
    <Provider store={store}>
        <App />
    </Provider>,
    document.getElementById('app')
);