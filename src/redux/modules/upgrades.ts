import _ from 'lodash';
import update from 'immutability-helper';
import database, {callbacks, type DiscoverWhen, type Upgrade, type UpgradeId, type UpgradeRecord, type UpgradeState} from "../../database/upgrades";
import {recalculateState, withRecalculation} from "../reducer";
import {batch} from "react-redux";
import {hasLifetimeQuantities} from "./resources";
import {getNumBuilt, getStructure} from "./structures";

export interface UpgradesState {
    byId: Partial<Record<UpgradeId, Upgrade>>;
}

// Actions
// export const SILHOUETTE = 'upgrades/SILHOUETTE';
export const DISCOVER = 'upgrades/DISCOVER' as const;
export const RESEARCH = 'upgrades/RESEARCH' as const;
export const PROGRESS = 'upgrades/PROGRESS' as const;
export const PAUSE = 'upgrades/PAUSE' as const;
export const RESUME = 'upgrades/RESUME' as const;
export const FINISH = 'upgrades/FINISH' as const;
export const SKIP = 'upgrades/SKIP' as const; // same as finish but no callbacks (used for testing)

export type UpgradesAction =
    | { type: typeof DISCOVER; payload: { id: UpgradeId } }
    | { type: typeof RESEARCH; payload: { upgrade: Upgrade } }
    | { type: typeof PROGRESS; payload: { timeDelta: number } }
    | { type: typeof PAUSE; payload: { id: UpgradeId } }
    | { type: typeof RESUME; payload: { id: UpgradeId } }
    | { type: typeof FINISH; payload: { id: UpgradeId } }
    | { type: typeof SKIP; payload: { id: UpgradeId } };

// Initial State
const initialState: UpgradesState = {
    byId: {}
}

// Reducers
export default function reducer(state: UpgradesState = initialState, action: GameAction): UpgradesState {
    switch (action.type) {
        case DISCOVER:
            return setUpgradeState(state, action.payload.id, 'discovered')
        case RESEARCH:
            return update(state, {
                byId: {
                    [action.payload.upgrade.id]: {
                        state: { $set: 'researching' },
                        researchProgress: { $set: 0 }
                    }
                }
            });
        case PROGRESS:
            // If none are researching, short circuit
            if (!Object.values(state.byId).some(upgrade => upgrade?.state === 'researching')) {
                return state;
            }

            const newState: Partial<Record<UpgradeId, Upgrade>> = {};
            for (const [key, value] of Object.entries(state.byId) as [UpgradeId, Upgrade][]) {
                if (value.state === 'researching') {
                    newState[key] = Object.assign({}, value, {
                        researchProgress: (value.researchProgress ?? 0) + action.payload.timeDelta
                    });
                }
                else {
                    newState[key] = value;
                }
            }
            return Object.assign({}, state, { byId: newState });
        case PAUSE:
            return setUpgradeState(state, action.payload.id, 'paused');
        case RESUME:
            return setUpgradeState(state, action.payload.id, 'researching');
        case FINISH:
            return setUpgradeState(state, action.payload.id, 'researched');
        case SKIP:
            return setUpgradeState(state, action.payload.id, 'researched');
        default:
            return state;
    }
}

function setUpgradeState(state: UpgradesState, upgradeId: UpgradeId, upgradeState: UpgradeState): UpgradesState {
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
export function discover(id: UpgradeId) {
    return withRecalculation({ type: DISCOVER, payload: { id } }); // recalculate so we immediately calculate costs
}

export function researchUnsafe(upgrade: Upgrade): UpgradesAction | Thunk {
    if (upgrade.researchTime) {
        return { type: RESEARCH, payload: { upgrade } };
    }
    else {
        return function(dispatch: Dispatch, getState: GetState) {
            batch(() => {
                dispatch({ type: RESEARCH, payload: { upgrade } }); // Still need to dispatch RESEARCH to trigger research cost
                finishResearch(dispatch, getState, upgrade.id); // Then immediately finish research
            });
        }
    }
}
export function researchForFree(upgradeId: UpgradeId) {
    return (dispatch: Dispatch, getState: GetState) => {
        batch(() => {
            finishResearch(dispatch, getState, upgradeId)
        })
    }
}

export function skipResearch(upgradeId: UpgradeId) {
    return (dispatch: Dispatch, getState: GetState) => {
        batch(() => {
            dispatch({ type: SKIP, payload: { id: upgradeId } });
            dispatch(recalculateState());
        })
    }
}

export function pause(id: UpgradeId): UpgradesAction {
    return { type: PAUSE, payload: { id } };
}
export function resume(id: UpgradeId): UpgradesAction {
    return { type: RESUME, payload: { id } };
}

export function upgradesTick(timeDelta: number) {
    return (dispatch: Dispatch, getState: GetState) => {
        batch(() => {
            dispatch({ type: PROGRESS, payload: { timeDelta } });

            for (const [key, value] of Object.entries(getState().upgrades.byId) as [UpgradeId, Upgrade][]) {
                if (value.state === 'researching' && (value.researchProgress ?? 0) >= value.researchTime * 1000) {
                    finishResearch(dispatch, getState, key);
                }
            }
        });
    }
}

function checkForUpgradeDiscoveries(state: RootState, dispatch: Dispatch) {
    let hasDiscovery = false;

    for (const [upgradeId, upgradeDbRecord] of Object.entries(database) as [UpgradeId, UpgradeRecord][]) {
        const upgrade = getUpgrade(state.upgrades, upgradeId);
        if ((!upgrade || upgrade.state === 'hidden')) {
            if (shouldDiscover(upgradeDbRecord.discoverWhen, state)) {
                dispatch({ type: DISCOVER, payload: { id: upgradeId } })
                hasDiscovery = true;
            }
        }
    }

    return hasDiscovery;
}

function shouldDiscover(discoverWhen: DiscoverWhen | undefined, state: RootState) {
    if (!discoverWhen) {
        // discoverWhen must be defined for upgrade to be auto-discovered
        return false;
    }

    if (discoverWhen.resources &&
        !hasLifetimeQuantities(state.resources, discoverWhen.resources)) {
        return false;
    }

    if (discoverWhen.structures &&
        !(Object.entries(discoverWhen.structures) as [StructureId, number][]).every(([k,v]) => getNumBuilt(getStructure(state.structures, k)) >= v)) {
        return false;
    }

    if (discoverWhen.upgrades &&
        !discoverWhen.upgrades.every(upgradeId => isResearched(getUpgrade(state.upgrades, upgradeId as UpgradeId)))) {
        return false;
    }

    return true;
}

// This runs at a slower rate to save processing power (it is not important that it updates immediately)
export function upgradesTickSlow(timeDelta: number) {
    return (dispatch: Dispatch, getState: GetState) => {
        batch(() => {
            if (checkForUpgradeDiscoveries(getState(), dispatch)) {
                dispatch(recalculateState())
            }
        })
    }
}

function finishResearch(dispatch: Dispatch, getState: GetState, upgradeId: UpgradeId) {
    dispatch({ type: FINISH, payload: { id: upgradeId } });

    callbacks[upgradeId]?.onFinish?.(dispatch);

    // uncomment this if you want to immediately check for new upgrades
    // checkForUpgradeDiscoveries(getState(), dispatch)

    dispatch(recalculateState());
}


// Standard Functions
export function getUpgrade(state: UpgradesState, id: UpgradeId): Upgrade | undefined {
    return state.byId[id];
}
export function getResearchCost(upgrade: Upgrade): ResourceAmounts {
    return upgrade.cost;
}
export function isResearchable(upgrade: Upgrade | undefined): boolean {
    return !!upgrade && upgrade.state === 'discovered';
}
export function isResearched(upgrade: Upgrade | undefined): boolean {
    return !!upgrade && upgrade.state === 'researched';
}

export function visibleIds(state: UpgradesState): UpgradeId[] {
    return (Object.keys(state.byId) as UpgradeId[]).filter(id => {
        const upgrade = getUpgrade(state, id);
        return !isResearched(upgrade); // all states before 'researched' are visible
    });
}

export function getStandaloneIds(state: UpgradesState): UpgradeId[] {
    return (Object.keys(state.byId) as UpgradeId[]).filter(id => {
        const upgrade = state.byId[id];
        return upgrade?.standalone && upgrade.state !== 'researched';
    });
}

const ANIMATION_SPEED = 100; // should match transition-duration in ui.scss -> .progress-bar

// Returns an integer between 0 and 100 to represent % progress
export function getProgress(upgrade: Upgrade, forAnimation?: boolean) {
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