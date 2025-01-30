import {resetLastSavedAt, updateLastSavedAt, updateSetting} from "../redux/modules/game";
import store from "../redux/store";

const STATE_KEY = 'state'

export const loadState = () => {
    try {
        const serializedState = localStorage.getItem(STATE_KEY);
        if (serializedState === null) {
            return undefined;
        }
        const parsedState = JSON.parse(serializedState);

        // Slightly change the state we are about to load: hide the settings modal since often times it can be saved open
        if (parsedState && parsedState.game) {
            parsedState.game.settingsModalOpen = false;
        }

        return parsedState;
    } catch (err) {
        return undefined;
    }
}

export const saveState = (state) => {
    try {
        const serializedState = JSON.stringify(state);
        localStorage.setItem(STATE_KEY, serializedState);
        // console.log('Data has been saved');
        store.dispatch(updateLastSavedAt()); // todo maybe this shouldn't be in store? if they clear their cookies, then it's wrong
    } catch (err) {
        console.error('Error saving state: ', err);
    }
}

export const resetState = () => {
    try {
        localStorage.removeItem(STATE_KEY);
        // console.log('Saved data has been reset');
        store.dispatch(resetLastSavedAt());
    } catch (err) {
        console.error('Error resetting state: ', err);
    }
}