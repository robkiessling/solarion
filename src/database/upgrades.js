
import _ from 'lodash';

const base = {
    name: 'Unknown',
    description: "",
    level: 0
}

export default {
    solarPanel_largerPanels: _.merge({}, base, {
        name: "Mirrored Panels",

        // TODO don't harcode values into description, e.g. "Increase energy production by {{ multiplier * 100 }}% ..."
        description: "Increase solar panel energy production by 300%.",
        cost: {
            minerals: 10
        },
        multiplier: 3
    }),
    energyBay_largerCapacity: _.merge({}, base, {
        name: "Flux Capacitors",
        description: "Increase energy bay capacity by 1000%.",
        cost: {
            minerals: 10
        },
        multiplier: 10
    })
};

