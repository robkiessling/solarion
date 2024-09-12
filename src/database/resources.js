
import {getStructure} from "../redux/modules/structures";
import {getStructureStatistic} from "../redux/reducer";

const base = {
    name: 'Unknown',
    amount: 0,
    lifetimeTotal: 0,
    capacity: Infinity,
    visible: true, // Whether the resources shows up in display
    showRate: true // Whether the resource shows a rate in the display (only relevant if visible:true)
}

export default {
    ore: _.merge({}, base, {
        name: "Ore",
        amount: 100,
        icon: 'icon-stone-pile'
    }),
    energy: _.merge({}, base, {
        name: "Energy",
        amount: 100,
        icon: 'icon-electric'
    }),
    vents: _.merge({}, base, {
        name: "Thermal Vent",
        amount: 2,
        icon: 'icon-caldera',
        visible: false
    }),
    refinedMinerals: _.merge({}, base, {
        name: "Minerals",
        amount: 99999,
        icon: 'icon-crystal-growth'
    }),
    standardDroids: _.merge({}, base, {
        name: "Droids",
        amount: 0,
        icon: 'icon-vintage-robot',
        visible: true,
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

// These are not part of the stored state because they contain functions
export const calculators = {
    energy: {
        capacity: state => {
            let capacity = 500;

            const energyBay = getStructure(state.structures, 'energyBay');
            if (energyBay) {
                capacity += getStructureStatistic(state, energyBay, 'capacity').energy;
            }

            return capacity;
        }
    }
}
