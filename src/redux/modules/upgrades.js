import update from 'immutability-helper';
import _ from 'lodash';
import database, {callbacks} from '../../database/upgrades'
import {recalculateState, withRecalculation} from "../reducer";
import {batch} from "react-redux";

// Actions
export const DISCOVER = 'upgrades/DISCOVER';
export const RESEARCH = 'upgrades/RESEARCH';
export const PROGRESS = 'upgrades/PROGRESS';
export const FINISH = 'upgrades/FINISH';

// Initial State
const initialState = {
    byId: {},
    visibleIds: []
}

// Reducers
export default function reducer(state = initialState, action) {
    const payload = action.payload;

    switch (action.type) {
        case DISCOVER:
            if (!database[payload.id]) { console.error(`Invalid upgrade: ${payload.id}`); }
            return update(state, {
                byId: {
                    [payload.id]: {
                        $set: _.merge({}, database[payload.id], { id: payload.id })
                    }
                },
                visibleIds: { $push: [payload.id] }
            });
        case RESEARCH:
            return update(state, {
                byId: {
                    [payload.upgrade.id]: {
                        isResearching: { $set: true },
                        researchProgress: { $set: 0 }
                    }
                }
            });
        case PROGRESS:
            let newState = {};
            for (const [key, value] of Object.entries(state.byId)) {
                if (value.isResearching) {
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
                        isResearching: { $set: false }
                    }
                },
                // visibleIds: { $apply: function(x) { return x.filter(id => id !== payload.id); } }
            });
        default:
            return state;
    }
}

// Action Creators
export function discover(id) {
    return { type: DISCOVER, payload: { id } };
}

export function researchUnsafe(upgrade) {
    return withRecalculation({ type: RESEARCH, payload: { upgrade } });
}

export function upgradesTick(timeDelta) {
    return (dispatch, getState) => {
        batch(() => {
            dispatch({ type: PROGRESS, payload: { timeDelta } });

            for (const [key, value] of Object.entries(getState().upgrades.byId)) {
                if (value.isResearching && value.researchProgress >= value.researchTime * 1000) {
                    dispatch({ type: FINISH, payload: { id: key } });

                    if (callbacks[key] && callbacks[key].onFinish) {
                        callbacks[key].onFinish(dispatch);
                    }

                    dispatch(recalculateState());
                }
            }
        });
    }
}


// Standard Functions
export function getUpgrade(state, id) {
    return state.byId[id];
}
export function getResearchCost(upgrade) {
    return upgrade.cost;
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