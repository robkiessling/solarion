export const loadState = () => {
    try {
        const serializedState = localStorage.getItem('state');
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
        localStorage.setItem('state', serializedState);
        console.log('Data has been saved');
    } catch (err) {
        console.error('Error saving state: ', err);
    }
}

export const resetState = () => {
    try {
        localStorage.removeItem('state');
        console.log('Saved data has been reset');
    } catch (err) {
        console.error('Error resetting state: ', err);
    }
}