import React from 'react';
import ReactDOM from 'react-dom';

import { Provider } from 'react-redux';
import _ from 'lodash';
import store from './redux/store';

import App from './components/app';
import './styles/normalize.css';
import './styles/app.scss';

// Note: Singleton imports are necessary despite not being used in this file; they initialize the singletons
import gameClock from "./singletons/game_clock"
import {preload as preloadSfx, setCurrentTab as setSfxTab, setEnabled as setSfxEnabled} from "./singletons/audio";

import {hasStartedGame} from "./redux/modules/log";
import {syncTriggers} from "./redux/modules/triggers";
import {runGameMode} from "./dev/skips";

preloadSfx();
setSfxEnabled(store.getState().game.soundEnabled);
setSfxTab(store.getState().game.currentNavTab);
store.subscribe(() => {
    setSfxEnabled(store.getState().game.soundEnabled);
    setSfxTab(store.getState().game.currentNavTab); // base-tab clips stay quiet while another tab shows
});


if (hasStartedGame(store.getState().log)) {
    // initialize store subscriptions from previous saved state
    syncTriggers(store.getState().triggers)
} else {
    // fresh start! boots the campaign, or a dev skip mode (see dev/skips.ts)
    runGameMode(store.dispatch);
}

ReactDOM.render(
    <Provider store={store}>
        <App />
    </Provider>,
    document.getElementById('app')
);