import store from './store';

/**
 *
 * Triggers provide a way to perform actions when a specific state change occurs (and attempts to do so in the most
 * efficient way possible).
 *
 * Triggers currently will only be fired once (they are unsubscribed after firing).
 *
 * @param selector  Function that accepts one parameter `state` and returns the part of the state to listen to.
 * @param condition Function that accepts one parameter `slice` and should return true when the `action` is to be performed.
 *                  Note: `slice` is the piece of the state specified by `selector`.
 * @param action    Function to call when triggered.
 * @return function Returns an unsubscribe function that can be called to cancel the trigger early (if necessary)
 */
export function addTrigger(selector, condition, action) {
    return observeStore(store, selector, (state, unsubscribe) => {
        if (condition(state)) {
            action();
            unsubscribe();
        }
    });
}

// Subscribes to changes to a specific part of the store (specified by the `selector` parameter function).
// Taken from: https://github.com/reduxjs/redux/issues/303#issuecomment-125184409
function observeStore(store, selector, onChange) {
    let currentState;

    function handleChange() {
        let nextState = selector(store.getState());
        if (nextState !== currentState) {
            currentState = nextState;
            onChange(currentState, unsubscribe);
        }
    }

    let unsubscribe = store.subscribe(handleChange);
    handleChange();
    return unsubscribe;
}