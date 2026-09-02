import _ from 'lodash';

import {getStructure} from "../redux/modules/structures";
import {getStructureStatistic, type CalculatorSet} from "../redux/reducer";
import {probeCapacity} from "../lib/star";
import {isTargetingPlanet} from "../redux/modules/star";
import {INFINITY, type DeepPartial} from "../lib/helpers";

export interface ResourceRecord {
    name: string;
    amount: number;
    lifetimeTotal: number;
    capacity: number;
    /** whether the resource shows up in the resource bar */
    visible: boolean;
    /** whether the resource bar shows a rate (only relevant if visible) */
    showRate: boolean;
    icon?: string;
}

export interface Resource extends ResourceRecord {
    id: ResourceId;
}

const base: ResourceRecord = {
    name: 'Unknown',
    amount: 0,
    lifetimeTotal: 0,
    capacity: INFINITY,
    visible: true, // Whether the resources shows up in display
    showRate: true // Whether the resource shows a rate in the display (only relevant if visible:true)
}

/** A table entry: the overrides merged over `base` (deep, so a nested field can be overridden on its own) */
function resource(overrides: DeepPartial<ResourceRecord>): ResourceRecord {
    return _.merge({}, base, overrides);
}

const database = {
    ore: resource({
        name: "Ore",
        amount: 0,
        icon: 'icon-stone-pile'
    }),
    energy: resource({
        name: "Energy",
        amount: 0,
        icon: 'icon-electric'
    }),
    vents: resource({
        name: "Thermal Vent",
        amount: 1,
        icon: 'icon-caldera',
        visible: false
    }),
    refinedMinerals: resource({
        name: "Minerals",
        amount: 0,
        icon: 'icon-crystal-growth'
    }),
    standardDroids: resource({
        name: "Droids",
        amount: 0,
        icon: 'icon-vintage-robot',
        showRate: false // the resource bar shows the idle count in the rate slot instead
    }),
    buildableLand: resource({
        name: "Land",
        amount: 0,
        icon: 'icon-globe',
        visible: false
    }),
    developedLand: resource({
        name: "Dev Land",
        amount: 1, // starts at 1 for home base
        visible: false
    }),
    probes: resource({
        name: "Probes",
        amount: 0,
        icon: 'icon-satellite',
    }),
} satisfies Record<string, ResourceRecord>;

/** The resource ids: the keys of the table above */
export type ResourceId = keyof typeof database;

export default database;

/**
 * These resource values vary depending on the rest of the state. We define them as functions here, and the RESULT
 * of these function calls will be stored in the state. The results are recalculated often; see recalculateSlice method.
 * 
 * Note: `variables` is a special object that is calculated first; its result is provided to the rest of the functions as a
 * third parameter (that way many functions can be built off the same variables)
 */
export const calculators: Partial<Record<ResourceId, CalculatorSet<Resource>>> = {
    energy: {
        capacity: state => {
            let capacity = 100;

            const energyBay = getStructure(state.structures, 'energyBay');
            if (energyBay) {
                capacity += getStructureStatistic(state, energyBay, 'capacity').energy ?? 0;
            }

            if (isTargetingPlanet(state.star)) {
                // Capacity becomes directly proportional to mirrored energy output
                const solarPanel = getStructure(state.structures, 'solarPanel');
                capacity = getStructureStatistic(state, solarPanel, 'produces').energy ?? 0
            }

            return capacity;
        }
    },
    probes: {
        capacity: state => {
            return probeCapacity();
        }
    }
}