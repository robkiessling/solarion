
import _ from "lodash";
import {getNumBuilt, getStructure} from "../redux/modules/structures";
import {getUpgrade} from "../redux/modules/upgrades";

const base = {
    name: 'Unknown',
    amount: 0,
    lifetimeTotal: 0,
    capacity: Infinity
}

export default {
    minerals: _.merge({}, base, {
        name: "Minerals",
    }),
    energy: _.merge({}, base, {
        name: "Energy",
        amount: 100
    })
};

// These are not part of the stored state because they contain functions
export const calculators = {
    energy: {
        capacity: state => {
            let capacity = 100;

            const energyBay = getStructure(state.structures, 'energyBay');
            if (energyBay) {
                const largerCapacity = getUpgrade(state.upgrades, 'energyBay_largerCapacity');
                const energyBayCapacity = energyBay.capacity.energy * (largerCapacity && largerCapacity.level ? largerCapacity.multiplier : 1);
                capacity += (getNumBuilt(energyBay) * energyBayCapacity)
            }

            return capacity;
        }
    }
}
