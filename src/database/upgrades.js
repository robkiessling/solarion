
import _ from 'lodash';

const base = {
    name: 'Unknown',
    effects: {}
}

export default {
    solarPanel_largerPanels: _.merge({}, base, {
        name: "Larger Panels",
        cost: {
            minerals: {
                base: 10,
            }
        },
        effects: {
            produces: {
                energy: {
                    multiply: 1
                }
            }
        }
    })
};