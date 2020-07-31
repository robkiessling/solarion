
import _ from 'lodash';

const base = {
    name: 'Unknown',
    level: 0
}

export default {
    solarPanel_largerPanels: _.merge({}, base, {
        name: "Larger Panels",
        cost: {
            minerals: 10
        },
        multiplier: 3
    }),
    energyBay_largerCapacity: _.merge({}, base, {
        name: "Increased Capacity",
        cost: {
            minerals: 10
        },
        multiplier: 10
    })
};

