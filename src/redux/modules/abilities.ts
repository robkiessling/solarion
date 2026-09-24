import update, {Spec} from 'immutability-helper';
import database, {callbacks, calculators, type Ability, type AbilityId} from "../../database/base/abilities";
import {canCastAbility, recalculateState, withRecalculation} from "../reducer";
import {batch} from "react-redux";
import {play as playSfx} from "../../singletons/audio";
import _ from "lodash";
import {typedKeys} from "../../lib/helpers";

export interface AbilitiesState {
    byId: Partial<Record<AbilityId, Ability>>;
    visibleIds: AbilityId[];
    /** charge clicks within the last MANUAL_RATE_WINDOW, each with its energy and how long ago it landed (ms) */
    manualClicks: { age: number; energy: number }[];
}

/**
 * Whether the operator's clicks count toward the displayed energy rate (getNetResourceRates). Off, the rate is only
 * what the structures sustain on their own, so it stays negative while the harvester outruns the generators no
 * matter how fast the operator clicks.
 */
export const INCLUDE_MANUAL_RATE = true;
/** seconds of clicks the manual rate averages over; a click drops out of the rate entirely once it's this old */
export const MANUAL_RATE_WINDOW = 2;

export { calculators }

// Actions
export const LEARN = 'abilities/LEARN' as const;
export const START_CAST = 'abilities/START_CAST' as const;
export const PROGRESS = 'abilities/PROGRESS' as const;
export const END_CAST = 'abilities/END_CAST' as const;
export const END_COOLDOWN = 'abilities/END_COOLDOWN' as const;

export const CHARGE_RNG = 'abilities/CHARGE_RNG' as const;
export const SET_AUTOCASTABLE = 'abilities/SET_AUTOCASTABLE' as const;
export const SET_AUTOCAST = 'abilities/SET_AUTOCAST' as const;

export type AbilitiesAction =
    | { type: typeof LEARN; payload: { id: AbilityId } }
    | { type: typeof START_CAST; payload: { ability: Ability } }
    | { type: typeof PROGRESS; payload: { timeDelta: number } }
    | { type: typeof END_CAST; payload: { ability: Ability } }
    | { type: typeof END_COOLDOWN; payload: { ability: Ability } }
    /** animations: immutability-helper specs applied to the charge ability's animation counters */
    | { type: typeof CHARGE_RNG; payload: { resources: ResourceAmounts; animations: { [counter: string]: Spec<number> } } }
    | { type: typeof SET_AUTOCASTABLE; payload: { id: AbilityId } }
    | { type: typeof SET_AUTOCAST; payload: { id: AbilityId; on: boolean } };

// Initial State
const initialState: AbilitiesState = {
    byId: {},
    visibleIds: [],
    manualClicks: []
}

// Reducers
export default function reducer(state: AbilitiesState = initialState, action: GameAction): AbilitiesState {
    switch (action.type) {
        case LEARN:
            // If already learned, do nothing (prevents potential error state w/ duplicate visibleIds)
            if (state.byId[action.payload.id]) return state;

            return update(state, {
                byId: {
                    [action.payload.id]: {
                        $set: _.merge({}, database[action.payload.id], { id: action.payload.id })
                    }
                },
                visibleIds: { $push: [action.payload.id] }
            });
        case SET_AUTOCASTABLE:
            if (!state.byId[action.payload.id]) return state;
            return update(state, { byId: { [action.payload.id]: { autocastable: { $set: true } } } });
        case SET_AUTOCAST:
            if (!state.byId[action.payload.id]) return state;
            return update(state, { byId: { [action.payload.id]: { autocast: { $set: action.payload.on } } } });
        case START_CAST:
            return update(state, {
                byId: {
                    [action.payload.ability.id]: {
                        state: { $set: 'casting' },
                        castProgress: { $set: 0 }
                    }
                }
            });
        case PROGRESS: {
            // Recent clicks age every tick and drop out of the window, whether or not anything is casting
            const manualClicks = state.manualClicks.length === 0 ? state.manualClicks : state.manualClicks
                .map(click => ({ age: click.age + action.payload.timeDelta, energy: click.energy }))
                .filter(click => click.age < MANUAL_RATE_WINDOW * 1000);

            // If none are casting/cooldown, short circuit
            if (!Object.values(state.byId).some(ability => ability.state === 'casting' || ability.state === 'cooldown')) {
                return manualClicks === state.manualClicks ? state : Object.assign({}, state, { manualClicks });
            }

            const newState: Record<string, Ability> = {};
            for (const [key, value] of Object.entries(state.byId)) {
                if (value.state === 'casting') {
                    newState[key] = Object.assign({}, value, {
                        castProgress: (value.castProgress ?? 0) + action.payload.timeDelta
                    });
                }
                else if (value.state === 'cooldown') {
                    newState[key] = Object.assign({}, value, {
                        cooldownProgress: (value.cooldownProgress ?? 0) + action.payload.timeDelta
                    });
                }
                else {
                    newState[key] = value;
                }
            }
            return Object.assign({}, state, { byId: newState, manualClicks });
        }
        case END_CAST:
            if ((state.byId[action.payload.ability.id]?.cooldown ?? 0) > 0) {
                return update(state, {
                    byId: {
                        [action.payload.ability.id]: {
                            state: { $set: 'cooldown' },
                            castProgress: { $set: undefined },
                            cooldownProgress: { $set: 0 },
                        }
                    }
                });
            }
            else {
                return update(state, {
                    byId: {
                        [action.payload.ability.id]: {
                            state: { $set: 'ready' },
                            castProgress: { $set: undefined },
                        }
                    }
                });
            }
        case END_COOLDOWN:
            return update(state, {
                byId: {
                    [action.payload.ability.id]: {
                        state: { $set: 'ready' },
                        cooldownProgress: { $set: undefined },
                    }
                }
            });
        case CHARGE_RNG:
            return update(state, {
                byId: {
                    commandCenter_charge: {
                        animations: action.payload.animations
                    }
                },
                manualClicks: { $push: [{ age: 0, energy: action.payload.resources.energy ?? 0 }] }
            })
        default:
            return state;
    }
}

// Selectors

/** Energy per second from the operator's clicks over the last MANUAL_RATE_WINDOW; zero once the window is empty */
export function getManualRate(state: AbilitiesState): number {
    if (state.manualClicks.length === 0) return 0;
    return state.manualClicks.reduce((sum, click) => sum + click.energy, 0) / MANUAL_RATE_WINDOW;
}

// Action Creators
export function learn(id: AbilityId) {
    return withRecalculation({ type: LEARN, payload: { id } }); // recalculate so we immediately calculate costs
}
// Grants the autocast toggle (an upgrade's doing; the ability keeps it from then on)
export function setAutocastable(id: AbilityId): AbilitiesAction {
    return { type: SET_AUTOCASTABLE, payload: { id } };
}
// Turning autocast on while the ability is idle fires it at once, so the toggle never sits lit over a button that is
// doing nothing.
export function setAutocast(id: AbilityId, on: boolean) {
    return function(dispatch: Dispatch, getState: GetState) {
        dispatch({ type: SET_AUTOCAST, payload: { id, on } });
        if (on) autocastIfDue(dispatch, getState, id);
    }
}

// While suspended, standing orders don't start new casts (a cast already underway still finishes). The catch-up
// probe (lib/catch_up.ts) suspends them so the rates it measures exclude autocast spending; the jump then applies
// each cast at its own moment and price.
let autocastSuspended = false;
export function setAutocastSuspended(value: boolean) {
    autocastSuspended = value;
}

// An ability under a standing order recasts the moment it is ready and affordable. Called when a cast (or its
// cooldown) ends and on every tick, so an order that stalled on cost resumes as soon as the resources are there.
// Nothing is paid ahead: each cast pays its own cost when it starts, the way a click would, which matters for
// costs that climb per cast (the droid price).
function autocastIfDue(dispatch: Dispatch, getState: GetState, id: AbilityId) {
    if (autocastSuspended) return;
    const ability = getAbility(getState().abilities, id);
    if (!ability || !ability.autocast || !ability.autocastable) return;
    if (!canCastAbility(getState(), ability)) return;
    dispatch(startCastUnsafe(ability));
    if (ability.castTime > 0 && ability.castStartSound) { playSfx(ability.castStartSound); }
}
export function startCastUnsafe(ability: Ability) {
    return function(dispatch: Dispatch, getState: GetState) {
        batch(() => {
            dispatch({ type: START_CAST, payload: { ability } });
            const callback = callbacks[ability.id];
            if (callback && callback.onStart) {
                callback.onStart(dispatch, getState, ability);
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
export function chargeRNG(dispatch: Dispatch, getState: GetState) {
    const charge = getAbility(getState().abilities, 'commandCenter_charge');
    if (!charge || !charge.variables) { return; }

    const resources = {
        energy: 0,
        refinedMinerals: 0,
    }
    const animations: { [counter: string]: Spec<number> } = {}; // immutability-helper specs for the CHARGE_RNG reducer

    // 100% chance to generate energy
    resources.energy += charge.variables.energy;
    animations.numClicks = { $apply: (x: number) => x + 1 }
    animations.energyBonus = { $set: charge.variables.energy };

    // % chance to gain bonus minerals
    if (charge.variables.mineralChance > 0 && Math.random() <= charge.variables.mineralChance) {
        resources.refinedMinerals += charge.variables.mineralBonus
        animations.numMineralBonusProcs = { $apply: (x: number) => x + 1 }
        animations.mineralBonus = { $set: charge.variables.mineralBonus }
        playSfx('chargeMineralProc'); // layered over the click's own castFinishSound
    }

    dispatch({ type: CHARGE_RNG, payload: { resources, animations } })
}

// ms until the soonest cast or cooldown ends; Infinity when nothing is underway
export function msToNextBoundary(state: AbilitiesState): number {
    let soonest = Infinity;
    for (const ability of Object.values(state.byId)) {
        if (ability.state === 'casting') {
            soonest = Math.min(soonest, ability.castTime * 1000 - (ability.castProgress ?? 0));
        }
        else if (ability.state === 'cooldown') {
            soonest = Math.min(soonest, ability.cooldown * 1000 - (ability.cooldownProgress ?? 0));
        }
    }
    return Math.max(soonest, 0);
}

// Advances casts and cooldowns by timeDelta, stepping boundary to boundary rather than in one lump: a delta that
// covers several back-to-back autocasts (a late frame, a catch-up jump) completes each cast in turn instead of
// finishing only the first and discarding the rest of the time.
export function abilitiesTick(timeDelta: number) {
    return (dispatch: Dispatch, getState: GetState) => {
        batch(() => {
            let remaining = timeDelta;
            while (true) {
                const before = getState().abilities;
                const step = Math.min(remaining, msToNextBoundary(before));
                dispatch({ type: PROGRESS, payload: { timeDelta: step } });

                for (const value of Object.values(getState().abilities.byId)) {
                    if (value.state === 'casting' && (value.castProgress ?? 0) >= value.castTime * 1000) {
                        endCast(dispatch, getState, value);
                    }
                    if (value.state === 'cooldown' && (value.cooldownProgress ?? 0) >= value.cooldown * 1000) {
                        endCooldown(dispatch, getState, value);
                    }
                    // A stalled autocast (unaffordable when its last cast ended) retries here
                    if (value.autocast && value.state === 'ready') autocastIfDue(dispatch, getState, value.id);
                }

                remaining -= step;
                if (remaining <= 0) break;
                // A boundary that resolves to nothing (no state change) would loop forever at step 0
                if (step === 0 && getState().abilities === before) break;
            }
        });
    }
}

function endCast(dispatch: Dispatch, getState: GetState, ability: Ability) {
    dispatch({ type: END_CAST, payload: { ability } });
    if (ability.castFinishSound) { playSfx(ability.castFinishSound); }

    const callback = callbacks[ability.id];
    if (callback && callback.onFinish) {
        callback.onFinish(dispatch, getState);
    }

    dispatch(recalculateState());
    autocastIfDue(dispatch, getState, ability.id); // autocast goes straight into the next cast
}

function endCooldown(dispatch: Dispatch, getState: GetState, ability: Ability) {
    dispatch({ type: END_COOLDOWN, payload: { ability } });
    dispatch(recalculateState());
}


// Standard Functions
export function getAbility(state: AbilitiesState, id: AbilityId): Ability | undefined {
    return state.byId[id];
}
export function getAbilityCost(ability: Ability): ResourceAmounts {
    return ability.cost; // todo floor
}
export function getAbilityProduction(ability: Ability): ResourceAmounts {
    return ability.produces;
}
export function isReady(ability: Ability): boolean {
    return ability.state === 'ready';
}
export function isCasting(ability: Ability): boolean {
    return ability.state === 'casting';
}

export function visibleIds(state: AbilitiesState): AbilityId[] {
    return typedKeys(state.byId); // every ability that is learned is visible
}


const ANIMATION_SPEED = 100; // should match transition-duration in ui.scss -> .progress-bar

// Returns an integer between 0 and 100 to represent % progress
// Progress increases as ability is casting, and decreases as ability is on cooldown
export function getProgress(ability: Ability, forAnimation?: boolean) {
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