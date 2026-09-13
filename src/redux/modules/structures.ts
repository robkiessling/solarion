import _ from 'lodash';
import update from 'immutability-helper';
import database, {calculators, type Structure, type StructureStatus, type StructureType} from '../../database/structures';
import {recalculateState, withRecalculation} from "../reducer";
import {typedEntries} from "../../lib/helpers";

/** Per-structure animation state the base view renders from (see animationData) */
export type StructureAnimationData = Partial<Record<StructureId, { numBuilt: number, animationTag?: string }>>;

export interface StructuresState {
    byId: Partial<Record<StructureId, Structure>>;
    visibleIds: StructureId[];
}

export { calculators };
const RUNNING_COOLDOWN = 2; // After running out of resources, wait this number of seconds before running again

// Actions
export const LEARN = 'structures/LEARN' as const;
export const BUILD = 'structures/BUILD' as const;
export const BUILD_FOR_FREE = 'structures/BUILD_FOR_FREE' as const;
export const SET_RUNNING_RATE = 'structures/SET_RUNNING_RATE' as const;
export const SET_STATUS = 'structures/SET_STATUS' as const;
export const PROGRESS = 'structures/PROGRESS' as const;
export const ASSIGN_DROID = 'structures/ASSIGN_DROID' as const;
export const REMOVE_DROID = 'structures/REMOVE_DROID' as const;
export const DISABLE = 'structures/DISABLE' as const;

export type StructuresAction =
    | { type: typeof LEARN; payload: { id: StructureId } }
    | { type: typeof BUILD; payload: { structure: Structure; amount: number } }
    | { type: typeof BUILD_FOR_FREE; payload: { id: StructureId; amount: number } }
    | { type: typeof SET_RUNNING_RATE; payload: { id: StructureId; amount: number } }
    | { type: typeof SET_STATUS; payload: { id: StructureId; status: StructureStatus } }
    | { type: typeof PROGRESS; payload: { timeDelta: number } }
    | { type: typeof ASSIGN_DROID; payload: { id: StructureId; amount: number } }
    | { type: typeof REMOVE_DROID; payload: { id: StructureId; amount: number } }
    | { type: typeof DISABLE; payload: { id: StructureId } };

// Initial State
const initialState: StructuresState = {
    byId: {},
    visibleIds: []
}

// Reducers
export default function reducer(state: StructuresState = initialState, action: GameAction): StructuresState {
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
        case BUILD:
            return buildReducer(state, action.payload.structure.id, action.payload.amount);
        case BUILD_FOR_FREE:
            return buildReducer(state, action.payload.id, action.payload.amount);
        case SET_RUNNING_RATE:
            return update(state, {
                byId: {
                    [action.payload.id]: {
                        runningRate: { $set: action.payload.amount }
                    }
                }
            });
        case DISABLE:
            return update(state, {
                byId: {
                    [action.payload.id]: {
                        runningRate: { $set: 0 },
                        disabled: { $set: true }
                    }
                }
            });
        case SET_STATUS:
            return update(state, {
                byId: {
                    [action.payload.id]: {
                        status: { $set: action.payload.status },
                        runningCooldown: { $set: action.payload.status === 'insufficient' ? RUNNING_COOLDOWN * 1000 : 0 }
                    }
                }
            });
        case PROGRESS:
            const newState: Partial<Record<StructureId, Structure>> = {};
            for (const [key, value] of typedEntries(state.byId)) {
                if (value.runningCooldown !== 0) {
                    let newCooldown = value.runningCooldown - action.payload.timeDelta;
                    if (newCooldown <= 0) { newCooldown = 0; }

                    newState[key] = Object.assign({}, value, {
                        runningCooldown: newCooldown
                    });
                }
                else {
                    newState[key] = value;
                }
            }
            return Object.assign({}, state, { byId: newState });
        case ASSIGN_DROID:
            return update(state, {
                byId: {
                    [action.payload.id]: {
                        droidData: {
                            numDroidsAssigned: { $apply: (x: number) => x + action.payload.amount }
                        }
                    }
                }
            });
        case REMOVE_DROID:
            return update(state, {
                byId: {
                    [action.payload.id]: {
                        droidData: {
                            numDroidsAssigned: { $apply: (x: number) => x - action.payload.amount }
                        }
                    }
                }
            });


        default:
            return state;
    }
}

function buildReducer(state: StructuresState, id: StructureId, amount: number): StructuresState {
    return update(state, {
        byId: {
            [id]: {
                count: {
                    total: { $apply: function(x: number) { return x + amount; } }
                }
            }
        }
    });
}

// Action Creators
export function learn(id: StructureId) {
    return withRecalculation({ type: LEARN, payload: { id } });
}

// "Unsafe" means this will build the structure regardless of whether we have enough resources; you should always
// call canBuildStructure beforehand.
// TODO Maybe we should remove all "unsafe" methods and build them straight into their normal methods?
export function buildUnsafe(structure: Structure, amount: number) {
    return withRecalculation({ type: BUILD, payload: { structure, amount } });
}

export function buildForFree(id: StructureId, amount: number) {
    return withRecalculation({ type: BUILD_FOR_FREE, payload: { id, amount } });
}

export function assignDroidUnsafe(id: StructureId, amount = 1) {
    return withRecalculation({ type: ASSIGN_DROID, payload: { id, amount } });
}
export function removeDroidUnsafe(id: StructureId, amount = 1) {
    return withRecalculation({ type: REMOVE_DROID, payload: { id, amount } });
}

export function turnOff(id: StructureId) {
    return setRunningRate(id, 0);
}
export function setRunningRate(id: StructureId, amount: number) {
    return withRecalculation({ type: SET_RUNNING_RATE, payload: { id, amount } });
}

export function disable(id: StructureId) {
    return withRecalculation({ type: DISABLE, payload: { id } });
}

// Unlike other action creators, we are passing the dispatch as a parameter because we don't always end up dispatching
export function setStatus(dispatch: Dispatch, structure: Structure, status: StructureStatus) {
    if (structure.status !== status) {
        return dispatch(withRecalculation({ type: SET_STATUS, payload: { id: structure.id, status: status } }))
    }
}

export function structuresTick(timeDelta: number) {
    return (dispatch: Dispatch, getState: GetState) => {
        dispatch({ type: PROGRESS, payload: { timeDelta } });

        if (getState().game.rapidlyRecalcEnergy) {
            // Need to rapidly recalculate structure variables because it is changing with every new probe added
            dispatch(recalculateState('structures', 'probeFactory'));
            dispatch(recalculateState('structures', 'solarPanel'));
        }
    }
}




// Standard Functions
export function getStructure(state: StructuresState, id: StructureId): Structure | undefined {
    return state.byId[id];
}
export function getBuildCost(structure: Structure): ResourceAmounts {
    return structure.cost; // todo floor
}
export function getNumBuilt(structure: Structure | undefined): number {
    if (!structure) { return 0; }
    return structure.count.total;
}
export function countAllStructuresBuilt(state: StructuresState): number {
    return Object.values(state.byId).reduce((acc, structure) => {
        return acc + getNumBuilt(structure)
    }, 0);
}
export function getRunningRate(structure: Structure): number {
    return structure.runnable ? structure.runningRate : 1;
}
export function isRunning(structure: Structure): boolean {
    return structure.runnable ? (structure.runningRate > 0) : false;
}
export function hasInsufficientResources(structure: Structure): boolean {
    return structure.status === 'insufficient';
}

export function getVisibleIds(state: StructuresState, type?: StructureType) {
    if (type === undefined) {
        return state.visibleIds;
    }

    return state.visibleIds.filter(id => {
        return getStructure(state, id)?.type === type;
    });
}

export function animationData(state: StructuresState) {
    const result: StructureAnimationData = {};
    visibleStructures(state).forEach(structure => {
        result[structure.id] = {
            numBuilt: getNumBuilt(structure),
            animationTag: structure.animationTag
        };
    });
    return result;
}

// Helpers
/** The visible structures' records, in visibleIds order (visibleIds is always a subset of byId, so nothing is skipped) */
export function visibleStructures(state: StructuresState): Structure[] {
    return state.visibleIds.flatMap(id => getStructure(state, id) ?? []);
}
export function iterateVisible(state: StructuresState, callback: (structure: Structure) => void) {
    visibleStructures(state).forEach(callback);
}