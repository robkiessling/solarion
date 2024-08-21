
import {getStructure, getStatistic} from "../redux/modules/structures";

const base = {
    name: 'Unknown',
    amount: 0,
    lifetimeTotal: 0,
    capacity: Infinity,
    visible: true // Whether the resources shows up in top-right display
}

export default {
    minerals: _.merge({}, base, {
        name: "Ore",
        amount: 100,
        icon: 'icon-rock'
    }),
    energy: _.merge({}, base, {
        name: "Energy",
        amount: 100,
        icon: 'icon-electric'
    }),
    vents: _.merge({}, base, {
        name: "Thermal Vent",
        amount: 2,
        icon: 'icon-caldera'
    }),
    refinedMinerals: _.merge({}, base, {
        name: "Refined Ore",
        amount: 0,
        icon: 'icon-rock2'
    }),
    maintenanceDroids: _.merge({}, base, {
        name: "Maintenance Droid",
        amount: 0,
        icon: 'icon-rock2',
        visible: false
    })
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
