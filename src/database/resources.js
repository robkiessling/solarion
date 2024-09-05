
import {getStructure, getStatistic} from "../redux/modules/structures";

const base = {
    name: 'Unknown',
    amount: 0,
    lifetimeTotal: 0,
    capacity: Infinity,
    visible: true // Whether the resources shows up in top-right display
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
        amount: 0,
        icon: 'icon-crystal-growth'
    }),
    standardDroids: _.merge({}, base, {
        name: "Droids",
        amount: 30,
        icon: 'icon-vintage-robot',
        visible: true
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
                capacity += getStatistic(energyBay, 'capacity').energy;
            }

            return capacity;
        }
    }
}
