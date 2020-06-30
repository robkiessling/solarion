import React from 'react';
import ReactDOM from 'react-dom';

import { Provider } from 'react-redux';
import store from './redux/store';

import App from './components/app';
import './styles/app.scss';

import { consume } from './redux/modules/resources';

window.store = store;
const unsubscribe = store.subscribe(() => console.log('subscribed event: ', store.getState()));
store.dispatch(consume('minerals', 10));
window.boundConsume = (resourceKey, amount) => store.dispatch(consume(resourceKey, amount));

ReactDOM.render(
    <Provider store={store}>
        <App />
    </Provider>,
    document.getElementById('app')
);