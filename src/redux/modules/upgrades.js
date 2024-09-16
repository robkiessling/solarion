import update from 'immutability-helper';
import database, {STATES, callbacks} from '../../database/upgrades'
import {recalculateState, withRecalculation} from "../reducer";
import {batch} from "react-redux";
import {LEARN} from "./abilities";
import {getLifetimeQuantity, getResource, hasLifetimeQuantities} from "./resources";
import {getNumBuilt, getStructure} from "./structures";

// Actions
// export const SILHOUETTE = 'upgrades/SILHOUETTE';
export const DISCOVER = 'upgrades/DISCOVER';
export const RESEARCH = 'upgrades/RESEARCH';
export const PROGRESS = 'upgrades/PROGRESS';
export const PAUSE = 'upgrades/PAUSE';
export const RESUME = 'upgrades/RESUME';
export const FINISH = 'upgrades/FINISH';

// Initial State
const initialState = {
    byId: {}
}

// Reducers
export default function reducer(state = initialState, action) {
    const payload = action.payload;

    switch (action.type) {
        // case SILHOUETTE:
        //     return setUpgradeState(state, payload.id, STATES.silhouetted)
        case DISCOVER:
            return setUpgradeState(state, payload.id, STATES.discovered)
        case RESEARCH:
            return update(state, {
                byId: {
                    [payload.upgrade.id]: {
                        state: { $set: STATES.researching },
                        researchProgress: { $set: 0 }
                    }
                }
            });
        case PROGRESS:
            let newState = {};
            for (const [key, value] of Object.entries(state.byId)) {
                if (value.state === STATES.researching) {
                    newState[key] = Object.assign({}, value, {
                        researchProgress: value.researchProgress + payload.timeDelta
                    });
                }
                else {
                    newState[key] = value;
                }
            }
            return Object.assign({}, state, { byId: newState });
        case PAUSE:
            return setUpgradeState(state, payload.id, STATES.paused);
        case RESUME:
            return setUpgradeState(state, payload.id, STATES.researching);
        case FINISH:
            return update(state, {
                byId: {
                    [payload.id]: {
                        state: { $set: STATES.researched }
                    }
                }
            });
        default:
            return state;
    }
}

function setUpgradeState(state, upgradeId, upgradeState) {
    if (state.byId[upgradeId]) {
        return update(state, {
            byId: {
                [upgradeId]: {
                    state: { $set: upgradeState }
                }
            }
        });
    }
    else {
        if (!database[upgradeId]) { console.error(`Invalid upgrade: ${upgradeId}`); }

        return update(state, {
            byId: {
                [upgradeId]: {
                    $set: _.merge({}, database[upgradeId], { id: upgradeId, state: upgradeState })
                }
            }
        });
    }
}

// Action Creators
// export function silhouette(id) {
//     return { type: SILHOUETTE, payload: { id } };
// }
export function discover(id) {
    return withRecalculation({ type: DISCOVER, payload: { id } }); // recalculate so we immediately calculate costs
}

export function researchUnsafe(upgrade) {
    if (upgrade.researchTime) {
        return { type: RESEARCH, payload: { upgrade } };
    }
    else {
        return function(dispatch, getState) {
            batch(() => {
                dispatch({ type: RESEARCH, payload: { upgrade } }); // Still need to dispatch RESEARCH to trigger research cost
                finishResearch(dispatch, getState, upgrade.id); // Then immediately finish research
            });
        }
    }
}

export function pause(id) {
    return { type: PAUSE, payload: { id } };
}
export function resume(id) {
    return { type: RESUME, payload: { id } };
}

export function upgradesTick(timeDelta) {
    return (dispatch, getState) => {
        batch(() => {
            dispatch({ type: PROGRESS, payload: { timeDelta } });

            for (const [key, value] of Object.entries(getState().upgrades.byId)) {
                if (value.state === STATES.researching && value.researchProgress >= value.researchTime * 1000) {
                    finishResearch(dispatch, getState, key);
                }
            }
        });
    }
}

function checkForUpgradeDiscoveries(state, dispatch) {
    let hasDiscovery = false;

    for (const [upgradeId, upgradeDbRecord] of Object.entries(database)) {
        const upgrade = getUpgrade(state.upgrades, upgradeId);
        if ((!upgrade || upgrade.state === STATES.hidden)) {
            if (shouldDiscover(upgradeDbRecord.discoverWhen, state)) {
                dispatch({ type: DISCOVER, payload: { id: upgradeId } })
                hasDiscovery = true;
            }
        }
    }

    return hasDiscovery;
}

function shouldDiscover(discoverWhen, state) {
    if (!discoverWhen) {
        // discoverWhen must be defined for upgrade to be auto-discovered
        return false;
    }

    if (discoverWhen.resources &&
        !hasLifetimeQuantities(state.resources, discoverWhen.resources)) {
        return false;
    }

    if (discoverWhen.structures &&
        !Object.entries(discoverWhen.structures).every(([k,v]) => getNumBuilt(getStructure(state.structures, k)) >= v)) {
        return false;
    }

    if (discoverWhen.upgrades &&
        !discoverWhen.upgrades.every(upgradeId => isResearched(getUpgrade(state.upgrades, upgradeId)))) {
        return false;
    }

    return true;
}

// This runs at a slower rate to save processing power (it is not important that it updates immediately)
export function upgradesTickSlow(timeDelta) {
    return (dispatch, getState) => {
        batch(() => {
            if (checkForUpgradeDiscoveries(getState(), dispatch)) {
                dispatch(recalculateState())
            }
        })
    }
}

function finishResearch(dispatch, getState, upgradeId) {
    dispatch({ type: FINISH, payload: { id: upgradeId } });

    if (callbacks[upgradeId] && callbacks[upgradeId].onFinish) {
        callbacks[upgradeId].onFinish(dispatch);
    }

    // uncomment this if you want to immediately check for new upgrades
    // checkForUpgradeDiscoveries(getState(), dispatch)

    dispatch(recalculateState());
}


// Standard Functions
export function getUpgrade(state, id) {
    return state.byId[id];
}
export function getResearchCost(upgrade) {
    return upgrade.cost; // todo floor
}
export function getName(upgrade) {
    // return upgrade.state === STATES.silhouetted ? '?' : upgrade.name;
    return upgrade.name;
}
export function isResearchable(upgrade) {
    return upgrade && upgrade.state === STATES.discovered;
}
export function isResearched(upgrade) {
    return upgrade && upgrade.state === STATES.researched;
}

export function visibleIds(state) {
    return Object.keys(state.byId).filter(id => {
        const upgrade = getUpgrade(state, id);
        return !isResearched(upgrade); // all states before 'researched' are visible
    });
}

export function getStandaloneIds(state) {
    return Object.keys(state.byId).filter(id => {
        const upgrade = getUpgrade(state, id);
        return upgrade.standalone && upgrade.state < STATES.researched;
    });
}

const ANIMATION_SPEED = 100; // should match transition-duration in ui.scss -> .progress-bar

// Returns an integer between 0 and 100 to represent % progress
export function getProgress(upgrade, forAnimation) {
    if (upgrade.researchProgress) {
        let progressDecimal = upgrade.researchProgress / (upgrade.researchTime * 1000);

        if (forAnimation) {
            // if forAnimation, speed up the progress by the ANIMATION_SPEED
            // TODO doubling ANIMATION_SPEED because that seems to match better...
            const bonusProgress = ANIMATION_SPEED * 2 * progressDecimal;
            progressDecimal = (upgrade.researchProgress + bonusProgress) / (upgrade.researchTime * 1000);
        }

        return _.round(Math.min(progressDecimal * 100, 100), 3);
    }
    else {
        return 0;
    }
}