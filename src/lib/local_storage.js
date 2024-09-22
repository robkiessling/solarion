import {resetLastSavedAt, updateLastSavedAt, updateSetting} from "../redux/modules/game";
import store from "../redux/store";

const STORAGE_KEY = 'state'

export const loadState = () => {
    try {
        const serializedState = localStorage.getItem(STORAGE_KEY);
        if (serializedState === null) {
            return undefined;
        }
        return JSON.parse(serializedState);
    } catch (err) {
        return undefined;
    }
}

export const saveState = (state) => {
    try {
        const serializedState = JSON.stringify(state);
        localStorage.setItem(STORAGE_KEY, serializedState);
        // console.log('Data has been saved');
        store.dispatch(updateLastSavedAt());
    } catch (err) {
        console.error('Error saving state: ', err);
    }
}

export const resetState = () => {
    try {
        localStorage.removeItem(STORAGE_KEY);
        // console.log('Saved data has been reset');
        store.dispatch(resetLastSavedAt());
    } catch (err) {
        console.error('Error resetting state: ', err);
    }
}