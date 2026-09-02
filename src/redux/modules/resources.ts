import _ from 'lodash';
import update from 'immutability-helper';
import {INFINITY, mapObject, roundToDecimal} from "../../lib/helpers";
import database, {calculators, type Resource} from "../../database/resources";
import * as fromStructures from "./structures";
import * as fromUpgrades from "./upgrades";
import * as fromAbilities from "./abilities";
import * as fromPlanet from "./planet";
import {withRecalculation} from "../reducer";
import {STATUSES, TERRAINS, type PlanetMap} from "../../lib/planet_map";

export interface ResourcesState {
    byId: Partial<Record<ResourceId, Resource>>;
    visibleIds: ResourceId[];
}

export { calculators };

// Actions
export const LEARN = 'resources/LEARN' as const;
export const CONSUME = 'resources/CONSUME' as const;
export const PRODUCE = 'resources/PRODUCE' as const;

export type ResourcesAction =
    | { type: typeof LEARN; payload: { id: ResourceId } }
    | { type: typeof CONSUME; payload: { amounts: ResourceAmounts } }
    | { type: typeof PRODUCE; payload: { amounts: ResourceAmounts } };

// Initial State
const initialState: ResourcesState = {
    byId: {},
    visibleIds: []
}

// Reducer
export default function reducer(state: ResourcesState = initialState, action: GameAction): ResourcesState {
    switch (action.type) {
        case LEARN:
            // If already learned, do nothing (prevents potential error state w/ duplicate visibleIds)
            if (state.byId[action.payload.id as ResourceId]) return state;

            return update(state, {
                byId: {
                    [action.payload.id]: {
                        $set: _.merge({}, database[action.payload.id as ResourceId], { id: action.payload.id, lifetimeTotal: database[action.payload.id as ResourceId].amount })
                    }
                },

                // Only resources with the visible:true attribute get added to visibleIds
                visibleIds: { $push: database[action.payload.id as ResourceId].visible ? [action.payload.id] : [] }
            });
        case CONSUME:
            return consumeReducer(state, action.payload.amounts);
        case PRODUCE:
            return produceReducer(state, action.payload.amounts);
        case fromStructures.BUILD:
            return consumeReducer(state, fromStructures.getBuildCost(action.payload.structure));
        case fromUpgrades.RESEARCH:
            return consumeReducer(state, fromUpgrades.getResearchCost(action.payload.upgrade));
        case fromAbilities.START_CAST:
            return consumeReducer(state, fromAbilities.getAbilityCost(action.payload.ability));
        case fromAbilities.END_CAST:
            return produceReducer(state, fromAbilities.getAbilityProduction(action.payload.ability));
        case fromAbilities.CHARGE_RNG:
            return produceReducer(state, action.payload.resources)
        case fromStructures.ASSIGN_DROID:
        case fromPlanet.ASSIGN_DROID:
            return consumeReducer(state, { standardDroids: action.payload.amount })
        case fromStructures.REMOVE_DROID:
            // Do not want assigning/removing droids to affect lifetimeTotal
            return produceReducer(state, { standardDroids: action.payload.amount }, false)
        case fromPlanet.REMOVE_DROID:
            // Recalled scouts walk home and credit on arrival (see PROGRESS numArrivedHome below); only droids that
            // despawned immediately (unplaced/already home) credit now
            return action.payload.instantIndices.length > 0
                ? produceReducer(state, { standardDroids: action.payload.instantIndices.length }, false)
                : state;
        case fromPlanet.DEPLOY_SQUAD:
            return consumeReducer(state, { standardDroids: action.payload.assignedDroids })
        case fromPlanet.DISBAND_SQUAD: {
            // Only recovered droids return to the idle pool (surviving units settled back into whole droids
            // by the disband thunk); combat losses are permanent (never re-credited). Any undelivered cargo
            // banks here too. Rewards must be already-LEARNed resources (unlearned ids are dropped silently
            // by produceReducer).
            let next = state;
            if (action.payload.droidsReturned > 0) {
                next = produceReducer(next, { standardDroids: action.payload.droidsReturned }, false);
            }
            if (action.payload.cargo && Object.keys(action.payload.cargo).length > 0) {
                next = produceReducer(next, action.payload.cargo);
            }
            return next;
        }
        case fromPlanet.SQUAD_DELIVER_CARGO:
            // The squad touched the powered grid: cargo banks (lost on a wipe, so this is the payoff moment)
            return produceReducer(state, action.payload.cargo)
        case fromPlanet.GENERATE_MAP: {
            // Starting land: the already-explored flatland around home. Infested flatland never counts until
            // its nest is cleared (see SQUAD_FIGHT_WON below).
            let startingLand = 0;
            (action.payload.map as PlanetMap).forEach(row => row.forEach(sector => {
                if (sector.status === STATUSES.explored.key &&
                    sector.terrain === TERRAINS.flatland.key && !sector.infestedBy) {
                    startingLand++;
                }
            }));
            return produceReducer(state, { buildableLand: startingLand });
        }
        case fromPlanet.SQUAD_FIGHT_WON:
            // A cleared nest retracts its infestation; the revealed flatland under it credits as one chunk
            return action.payload.landCredit > 0
                ? produceReducer(state, { buildableLand: action.payload.landCredit })
                : state;
        case fromPlanet.ADVANCE_SQUAD:
            // The driven squad reveals tiles just like scouts do; same land credit.
            return action.payload.revealedFlatland > 0
                ? produceReducer(state, { buildableLand: action.payload.revealedFlatland })
                : state;
        case fromPlanet.PROGRESS: {
            // Droids reveal tiles as they explore; each newly-revealed flatland tile adds buildable land.
            let next = state;
            if (action.payload.revealedFlatland > 0) {
                next = produceReducer(next, { buildableLand: action.payload.revealedFlatland });
            }
            // Recalled scouts rejoin the idle pool as they arrive home
            if (action.payload.numArrivedHome > 0) {
                next = produceReducer(next, { standardDroids: action.payload.numArrivedHome }, false);
            }
            return next;
        }
        default:
            return state;
    }
}
function consumeReducer(state: ResourcesState, amounts: ResourceAmounts) {
    return update(state, {
        byId: mapObject(amounts, (resourceId, amount) => (
            { amount: { $apply: function(x: number) { return x - (amount ?? 0); } } }
        ))
    });
}
function produceReducer(state: ResourcesState, amounts: ResourceAmounts, incrementLifetimeTotal = true) {
    return update(state, {
        byId: mapObject(amounts, (resourceId, amount = 0) => {
            const resource = getResource(state, resourceId as ResourceId);
            if (!resource) { return {}; }
            const capacity = getCapacity(resource);
            const oldAmount = getQuantity(resource);
            const newAmount = Math.min(oldAmount + amount, capacity);
            const gain = capacity === INFINITY ? amount : (newAmount - oldAmount);
            return {
                amount: { $set: roundToDecimal(newAmount, 5) },
                lifetimeTotal: { $apply: function(x: number) { return incrementLifetimeTotal ? roundToDecimal(x + gain, 5) : x; } }
            }
        })
    });
}

// Action Creators
export function learn(id: ResourceId) {
    return withRecalculation({ type: LEARN, payload: { id } });
}

export function consume(amounts: ResourceAmounts) {
    return function(dispatch: Dispatch, getState: GetState) {
        if (canConsume(getState().resources, amounts)) {
            dispatch(consumeUnsafe(amounts));
        }
    }
}
export function consumeUnsafe(amounts: ResourceAmounts): ResourcesAction {
    return { type: CONSUME, payload: { amounts } };
}

export function produce(amounts: ResourceAmounts): ResourcesAction {
    return { type: PRODUCE, payload: { amounts } };
}


// Standard Functions
export function getResource(state: ResourcesState, id: ResourceId): Resource | undefined {
    return state.byId[id];
}
export function canConsume(state: ResourcesState, amounts: ResourceAmounts): boolean {
    return (Object.entries(amounts) as [ResourceId, number][]).every(([k,v]) => getQuantity(getResource(state, k)) >= v);
}
export function hasLifetimeQuantities(state: ResourcesState, amounts: ResourceAmounts): boolean {
    return (Object.entries(amounts) as [ResourceId, number][]).every(([k,v]) => getLifetimeQuantity(getResource(state, k)) >= v);
}
export function getQuantity(resource: Resource | undefined): number {
    if (!resource) {
        return 0;
    }
    return resource.amount;
}
export function getLifetimeQuantity(resource: Resource | undefined): number {
    if (!resource) {
        return 0;
    }
    return resource.lifetimeTotal;
}
export function getCapacity(resource: Resource | undefined): number {
    return resource ? resource.capacity : 0;
}
export function getIcon(id: ResourceId): string | undefined {
    return database[id].icon;
}
export function getIconSpan(id: ResourceId, skinny: boolean = false, colorless: boolean = true): string {
    return `<span class="${getIcon(id) ?? ''} ${skinny ? 'skinny-icon' : ''} ${colorless ? 'colorless-icon' : ''}"></span>`;
}
export function highlightCosts(state: ResourcesState, amounts: ResourceAmounts) {
    return mapObject(amounts as Record<string, number>, (resourceId, resourceCost) => {
        return {
            amount: resourceCost,
            hasEnough: getQuantity(getResource(state, resourceId as ResourceId)) >= resourceCost
        }
    });
}