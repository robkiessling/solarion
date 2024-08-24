import update from 'immutability-helper';
import database, {STATES, callbacks, calculators} from '../../database/abilities'
import {recalculateState, withRecalculation} from "../reducer";
import {batch} from "react-redux";
import {getUpgrade, isResearched} from "./upgrades";
import {BUILD} from "./structures";

export { calculators }

// Actions
export const LEARN = 'abilities/LEARN';
export const START_CAST = 'abilities/START_CAST';
export const PROGRESS = 'abilities/PROGRESS';
export const END_CAST = 'abilities/END_CAST';
export const END_COOLDOWN = 'abilities/END_COOLDOWN';

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
                else if (value.state === STATES.cooldown) {
                    newState[key] = Object.assign({}, value, {
                        cooldownProgress: value.cooldownProgress + payload.timeDelta
                    });
                }
                else {
                    newState[key] = value;
                }
            }
            return Object.assign({}, state, { byId: newState });
        case END_CAST:
            if (state.byId[payload.ability.id].cooldown > 0) {
                return update(state, {
                    byId: {
                        [payload.ability.id]: {
                            state: { $set: STATES.cooldown },
                            castProgress: { $set: undefined },
                            cooldownProgress: { $set: 0 },
                        }
                    }
                });
            }
            else {
                return update(state, {
                    byId: {
                        [payload.ability.id]: {
                            state: { $set: STATES.ready },
                            castProgress: { $set: undefined },
                        }
                    }
                });
            }
        case END_COOLDOWN:
            return update(state, {
                byId: {
                    [payload.ability.id]: {
                        state: { $set: STATES.ready },
                        cooldownProgress: { $set: undefined },
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
    // Need to recalculate because some abilities have buffs that need to be applied right at cast start
    return withRecalculation({ type: START_CAST, payload: { ability } });
}

export function abilitiesTick(timeDelta) {
    return (dispatch, getState) => {
        batch(() => {
            dispatch({ type: PROGRESS, payload: { timeDelta } });

            for (const [key, value] of Object.entries(getState().abilities.byId)) {
                if (value.state === STATES.casting && value.castProgress >= value.castTime * 1000) {
                    endCast(dispatch, value);
                }
                if (value.state === STATES.cooldown && value.cooldownProgress >= value.cooldown * 1000) {
                    endCooldown(dispatch, value);
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

function endCooldown(dispatch, ability) {
    dispatch({ type: END_COOLDOWN, payload: { ability } });
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
export function isReady(ability) {
    return ability.state === STATES.ready;
}
export function isCasting(ability) {
    return ability.state === STATES.casting;
}

export function visibleIds(state) {
    return Object.keys(state.byId); // every ability that is learned is visible
}


const ANIMATION_SPEED = 100; // should match transition-duration in ui.scss -> .progress-bar

// Returns an integer between 0 and 100 to represent % progress
// Progress increases as ability is casting, and decreases as ability is on cooldown
export function getProgress(ability, forAnimation) {
    let progressDecimal;
    if (ability.castProgress !== undefined) {
        progressDecimal = ability.castProgress / (ability.castTime * 1000);
        if (forAnimation) {
            // if forAnimation, speed up the progress by the ANIMATION_SPEED
            // TODO doubling ANIMATION_SPEED because that seems to match better...
            const bonusProgress = ANIMATION_SPEED * 2 * progressDecimal;
            progressDecimal = (ability.castProgress + bonusProgress) / (ability.castTime * 1000);
        }
        return _.round(Math.min(progressDecimal * 100, 100), 3);
    }
    else if (ability.cooldownProgress !== undefined) {
        let progress = ability.cooldown * 1000 - ability.cooldownProgress; // invert since going from 100 to 0
        progressDecimal = progress / (ability.cooldown * 1000);
        if (forAnimation) {
            // if forAnimation, speed up the progress by the ANIMATION_SPEED
            // TODO doubling ANIMATION_SPEED because that seems to match better...
            const bonusProgress = ANIMATION_SPEED * 2 * progressDecimal;
            progressDecimal = (progress - bonusProgress) / (ability.cooldown * 1000);
        }
        return _.round(Math.max(progressDecimal * 100, 0), 3);
    }
    else {
        return 0;
    }
}