import update from 'immutability-helper';
import database, {STATES, callbacks, calculators} from '../../database/abilities'
import {recalculateState, withRecalculation} from "../reducer";
import {batch} from "react-redux";

export { calculators }

// Actions
export const LEARN = 'abilities/LEARN';
export const START_CAST = 'abilities/START_CAST';
export const PROGRESS = 'abilities/PROGRESS';
export const END_CAST = 'abilities/END_CAST';

// Initial State
const initialState = {
    byId: {},
    visibleIds: []
}

// Reducers
export default function reducer(state = initialState, action) {
    const payload = action.payload;

    switch (action.type) {
        case LEARN:
            return update(state, {
                byId: {
                    [payload.id]: {
                        $set: _.merge({}, database[payload.id], { id: payload.id })
                    }
                },
                visibleIds: { $push: [payload.id] }
            });
        case START_CAST:
            return update(state, {
                byId: {
                    [payload.ability.id]: {
                        state: { $set: STATES.casting },
                        castProgress: { $set: 0 }
                    }
                }
            });
        case PROGRESS:
            let newState = {};
            for (const [key, value] of Object.entries(state.byId)) {
                if (value.state === STATES.casting) {
                    newState[key] = Object.assign({}, value, {
                        castProgress: value.castProgress + payload.timeDelta
                    });
                }
                else {
                    newState[key] = value;
                }
            }
            return Object.assign({}, state, { byId: newState });
        case END_CAST:
            return update(state, {
                byId: {
                    [payload.ability.id]: {
                        state: { $set: STATES.ready }
                    }
                }
            });
        default:
            return state;
    }
}

// Action Creators
export function learn(id) {
    return { type: LEARN, payload: { id } };
}
export function startCastUnsafe(ability) {
    return { type: START_CAST, payload: { ability } }
}

export function abilitiesTick(timeDelta) {
    return (dispatch, getState) => {
        batch(() => {
            dispatch({ type: PROGRESS, payload: { timeDelta } });

            for (const [key, value] of Object.entries(getState().abilities.byId)) {
                if (value.state === STATES.casting && value.castProgress >= value.castTime * 1000) {
                    endCast(dispatch, value);
                }
            }
        });
    }
}

function endCast(dispatch, ability) {
    dispatch({ type: END_CAST, payload: { ability } });

    if (callbacks[ability.id] && callbacks[ability.id].onFinish) {
        callbacks[ability.id].onFinish(dispatch);
    }

    dispatch(recalculateState());
}


// Standard Functions
export function getAbility(state, id) {
    return state.byId[id];
}
export function getAbilityCost(ability) {
    return ability.cost;
}
export function getAbilityProduction(ability) {
    return ability.produces;
}
export function isCastable(ability) {
    return ability.state === STATES.ready;
}


const ANIMATION_SPEED = 100; // should match transition-duration in ui.scss -> .progress-bar

// Returns an integer between 0 and 100 to represent % progress
export function getProgress(ability, forAnimation) {
    if (ability.castProgress) {
        let progressDecimal = ability.castProgress / (ability.castTime * 1000);

        if (forAnimation) {
            // if forAnimation, speed up the progress by the ANIMATION_SPEED
            // TODO doubling ANIMATION_SPEED because that seems to match better...
            const bonusProgress = ANIMATION_SPEED * 2 * progressDecimal;
            progressDecimal = (ability.castProgress + bonusProgress) / (ability.castTime * 1000);
        }

        return _.round(Math.min(progressDecimal * 100, 100), 3);
    }
    else {
        return 0;
    }
}