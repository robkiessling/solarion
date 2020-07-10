
import _ from "lodash";

export const UNLIMITED = 'unlimited';

const base = {
    name: 'Unknown',
    amount: 0,
    capacity: UNLIMITED
}

export default {
    minerals: _.merge({}, base, {
        name: "Minerals",
    }),
    energy: _.merge({}, base, {
        name: "Energy",
    })
};