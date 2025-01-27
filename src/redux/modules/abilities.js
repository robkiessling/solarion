import update from 'immutability-helper';
import database, {STATES, callbacks, calculators} from '../../database/abilities'
import {recalculateState, withRecalculation} from "../reducer";
import {batch} from "react-redux";
import {getUpgrade, isResearched} from "./upgrades";
import {BUILD} from "./structures";
import _ from "lodash";

export { calculators }

// Actions
export const LEARN = 'abilities/LEARN';
export const START_CAST = 'abilities/START_CAST';
export const PROGRESS = 'abilities/PROGRESS';
export const END_CAST = 'abilities/END_CAST';
export const END_COOLDOWN = 'abilities/END_COOLDOWN';

export const CHARGE_RNG = 'abilities/CHARGE_RNG';

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
            // If none are casting/cooldown, short circuit
            if (!Object.values(state.byId).some(ability => ability.state === STATES.casting || ability.state === STATES.cooldown)) {
                return state;
            }

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
        case CHARGE_RNG:
            return update(state, {
                byId: {
                    commandCenter_charge: {
                        animations: payload.animations
                    }
                }
            })
        default:
            return state;
    }
}

// Action Creators
export function learn(id) {
    return withRecalculation({ type: LEARN, payload: { id } }); // recalculate so we immediately calculate costs
}
export function startCastUnsafe(ability) {
    return function(dispatch, getState) {
        batch(() => {
            dispatch({ type: START_CAST, payload: { ability } });
            if (callbacks[ability.id] && callbacks[ability.id].onStart) {
                callbacks[ability.id].onStart(dispatch, getState, ability);
            }

            if (ability.castTime === 0) {
                endCast(dispatch, getState, ability);
            }

            // Need to recalculate because some abilities have buffs that need to be applied right at cast start
            dispatch(recalculateState())
        });
    }
}

// The commandCenter_charge ability is a bit special. It has RNG components (e.g. 5% chance to generate a crystal)
// which is hard to build into the normal `produces` handler (and we don't want randomness in reducers). It also needs
// to trigger animations, some of which only happen some of the time (e.g. special animation when crystal is found).
export function chargeRNG(dispatch, getState) {
    const charge = getAbility(getState().abilities, 'commandCenter_charge');

    const resources = {
        energy: 0,
        refinedMinerals: 0,
    }
    const animations = {};

    // 100% chance to generate energy
    resources.energy += charge.variables.energy;
    animations.numClicks = { $apply: (x) => x + 1 }
    animations.energyBonus = { $set: charge.variables.energy };

    // % chance to gain bonus minerals
    if (charge.variables.mineralChance > 0 && Math.random() <= charge.variables.mineralChance) {
        resources.refinedMinerals += charge.variables.mineralBonus
        animations.numMineralBonusProcs = { $apply: (x) => x + 1 }
        animations.mineralBonus = { $set: charge.variables.mineralBonus }
    }

    dispatch({ type: CHARGE_RNG, payload: { resources, animations } })
}

export function abilitiesTick(timeDelta) {
    return (dispatch, getState) => {
        batch(() => {
            dispatch({ type: PROGRESS, payload: { timeDelta } });

            for (const [key, value] of Object.entries(getState().abilities.byId)) {
                if (value.state === STATES.casting && value.castProgress >= value.castTime * 1000) {
                    endCast(dispatch, getState, value);
                }
                if (value.state === STATES.cooldown && value.cooldownProgress >= value.cooldown * 1000) {
                    endCooldown(dispatch, getState, value);
                }
            }
        });
    }
}

function endCast(dispatch, getState, ability) {
    dispatch({ type: END_CAST, payload: { ability } });

    if (callbacks[ability.id] && callbacks[ability.id].onFinish) {
        callbacks[ability.id].onFinish(dispatch, getState);
    }

    dispatch(recalculateState());
}

function endCooldown(dispatch, getState, ability) {
    dispatch({ type: END_COOLDOWN, payload: { ability } });
    dispatch(recalculateState());
}


// Standard Functions
export function getAbility(state, id) {
    return state.byId[id];
}
export function getAbilityCost(ability) {
    return ability.cost; // todo floor
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