
import _ from "lodash";

const base = {
    name: 'Unknown',
    amount: 0,
    lifetimeTotal: 0,
    capacity: {
        base: Infinity
    }
}

export default {
    minerals: _.merge({}, base, {
        name: "Minerals",
    }),
    energy: _.merge({}, base, {
        name: "Energy",
        amount: 100,
        capacity: {
            base: 100
        }
    })
};