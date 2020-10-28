import update from 'immutability-helper';
import database, {STATES, TYPES, callbacks} from '../../database/upgrades'
import {recalculateState, withRecalculation} from "../reducer";
import {batch} from "react-redux";

// Actions
export const SILHOUETTE = 'upgrades/SILHOUETTE';
export const DISCOVER = 'upgrades/DISCOVER';
export const RESEARCH = 'upgrades/RESEARCH';
export const PROGRESS = 'upgrades/PROGRESS';
export const FINISH = 'upgrades/FINISH';

// Initial State
const initialState = {
    byId: {}
}

// Reducers
export default function reducer(state = initialState, action) {
    const payload = action.payload;

    switch (action.type) {
        case SILHOUETTE:
            return setUpgradeState(state, payload.id, STATES.silhouetted)
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
        case FINISH:
            return update(state, {
                byId: {
                    [payload.id]: {
                        level: { $apply: function(x) { return x + 1; } },
                        state: { $set: STATES.researched }
                    }
                }
            });
        default:
            return state;
    }
}

export function setUpgradeState(state, upgradeId, upgradeState) {
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
export function silhouette(id) {
    return { type: SILHOUETTE, payload: { id } };
}
export function discover(id) {
    return { type: DISCOVER, payload: { id } };
}

export function researchUnsafe(upgrade) {
    if (upgrade.researchTime) {
        return { type: RESEARCH, payload: { upgrade } };
    }
    else {
        return function(dispatch, getState) {
            batch(() => {
                finishResearch(dispatch, upgrade.id);
            });
        }
    }
}

export function upgradesTick(timeDelta) {
    return (dispatch, getState) => {
        batch(() => {
            dispatch({ type: PROGRESS, payload: { timeDelta } });

            for (const [key, value] of Object.entries(getState().upgrades.byId)) {
                if (value.state === STATES.researching && value.researchProgress >= value.researchTime * 1000) {
                    finishResearch(dispatch, key);
                }
            }
        });
    }
}

function finishResearch(dispatch, upgradeId) {
    dispatch({ type: FINISH, payload: { id: upgradeId } });

    if (callbacks[upgradeId] && callbacks[upgradeId].onFinish) {
        callbacks[upgradeId].onFinish(dispatch);
    }

    dispatch(recalculateState());
}


// Standard Functions
export function getUpgrade(state, id) {
    return state.byId[id];
}
export function getResearchCost(upgrade) {
    return upgrade.cost;
}
export function getName(upgrade) {
    return upgrade.state === STATES.silhouetted ? '?' : upgrade.name;
}
export function isResearchableState(upgrade) {
    return upgrade.state === STATES.discovered;
}


export function getStandaloneIds(state, type) {
    return Object.keys(state.byId).filter(id => {
        const upgrade = getUpgrade(state, id);
        return upgrade.standalone && upgrade.state < STATES.researched &&
            (type === undefined || upgrade.type === TYPES[type]);
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