
import _ from "lodash";
import {getStructure, getStatistic} from "../redux/modules/structures";

const base = {
    name: 'Unknown',
    amount: 0,
    lifetimeTotal: 0,
    capacity: Infinity
}

export default {
    minerals: _.merge({}, base, {
        name: "Minerals",
        amount: 100
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
                capacity += getStatistic(energyBay, 'capacity').energy;
            }

            return capacity;
        }
    }
}
