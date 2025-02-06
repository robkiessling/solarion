import update from 'immutability-helper';

export const ARROW_DIRECTIONS = {
    left: 'left',
    right: 'right',
    up: 'up',
    down: 'down'
}

export const ARROW_KEY_PRESSED = 'keyboard/ARROW_KEY_PRESSED';

// Currently this class has no reducer... other reducers just listen to its actions
// Maybe one day these will be modifiable, in which case we'll add a state here

export function arrowKeyPressed(direction) {
    return { type: ARROW_KEY_PRESSED, payload: { direction } };
}