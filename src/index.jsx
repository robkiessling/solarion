import React from 'react';
import ReactDOM from 'react-dom';

import { Provider } from 'react-redux';
import store from './redux/store';

import App from './components/app';
import './styles/app.scss';

// Note: Singleton imports are necessary despite not being used in this file; they initialize the singletons
import gameClock from "./singletons/game_clock"



// window.store = store;
// const unsubscribe = store.subscribe(() => console.log('subscribed event: ', store.getState()));

// import {learn as learnResource} from './redux/modules/resources';

// import * as fromStructures from './redux/modules/structures';
// import * as fromUpgrades from './redux/modules/upgrades';
// import * as fromReducer from './redux/reducer';

// store.dispatch(fromStructures.learn('solarPanel'));
// store.dispatch(fromStructures.learn('mineralHarvester'));
// store.dispatch(fromStructures.learn('energyBay'));
// store.dispatch(fromReducer.buildStructure('mineralHarvester', 1));
// store.dispatch(fromUpgrades.learn('solarPanel', 'solarPanel_largerPanels'));

import * as fromLog from './redux/modules/log';
store.dispatch(fromLog.startLogSequence('startup'));

ReactDOM.render(
    <Provider store={store}>
        <App />
    </Provider>,
    document.getElementById('app')
);