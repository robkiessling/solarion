
import {getStructure} from "../redux/modules/structures";
import {getStructureStatistic} from "../redux/reducer";
import {probeCapacity} from "../lib/star";
import {isTargetingPlanet} from "../redux/modules/star";
import {INFINITY} from "../lib/helpers";

const base = {
    name: 'Unknown',
    amount: 0,
    lifetimeTotal: 0,
    capacity: INFINITY,
    visible: true, // Whether the resources shows up in display
    showRate: true // Whether the resource shows a rate in the display (only relevant if visible:true)
}

export default {
    ore: _.merge({}, base, {
        name: "Ore",
        amount: 0,
        icon: 'icon-stone-pile'
    }),
    energy: _.merge({}, base, {
        name: "Energy",
        amount: 0,
        icon: 'icon-electric'
    }),
    vents: _.merge({}, base, {
        name: "Thermal Vent",
        amount: 1,
        icon: 'icon-caldera',
        visible: false
    }),
    refinedMinerals: _.merge({}, base, {
        name: "Minerals",
        amount: 0,
        icon: 'icon-crystal-growth'
    }),
    standardDroids: _.merge({}, base, {
        name: "Droids",
        amount: 0,
        icon: 'icon-vintage-robot',
        visible: false,
        showRate: false
    }),
    buildableLand: _.merge({}, base, {
        name: "Land",
        amount: 0,
        icon: 'icon-globe',
        visible: false
    }),
    developedLand: _.merge({}, base, {
        name: "Dev Land",
        amount: 1, // starts at 1 for home base
        visible: false
    }),
    probes: _.merge({}, base, {
        name: "Probes",
        amount: 0,
        icon: 'icon-satellite',
    }),
};

/**
 * These resource values vary depending on the rest of the state. We define them as functions here, and the RESULT
 * of these function calls will be stored in the state. The results are recalculated often; see recalculateSlice method.
 * 
 * Note: `variables` is a special object that is calculated first; its result is provided to the rest of the functions as a
 * third parameter (that way many functions can be built off the same variables)
 */
export const calculators = {
    energy: {
        capacity: state => {
            let capacity = 100;

            const energyBay = getStructure(state.structures, 'energyBay');
            if (energyBay) {
                capacity += getStructureStatistic(state, energyBay, 'capacity').energy;
            }

            if (isTargetingPlanet(state.star)) {
                // Capacity becomes directly proportional to mirrored energy output
                const solarPanel = getStructure(state.structures, 'solarPanel');
                capacity = getStructureStatistic(state, solarPanel, 'produces').energy
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
