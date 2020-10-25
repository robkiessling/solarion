
import _ from 'lodash';
import * as fromResources from "../redux/modules/resources";
import * as fromStructures from "../redux/modules/structures";

export const STATES = { // short values to improve string comparison performance
    hidden: 'h',
    silhouetted: 's',
    discovered: 'd',
    researching: 'r1',
    researched: 'r2'
}

const base = {
    name: 'Unknown',
    description: "",
    level: 0,
    researchTime: 0, // if 0, research will occur instantly
    state: STATES.hidden
}

// Functions can't be stored in the state so storing them in this const
export const callbacks = {
    researchSolar: {
        onFinish: (dispatch) => {
            dispatch(fromStructures.learn('solarPanel'));
        }
    },
    researchGas: {
        onFinish: (dispatch) => {
            dispatch(fromResources.learn('vents'));
            dispatch(fromStructures.learn('thermalVent'));
        }
    }
}

export default {
    researchSolar: _.merge({}, base, {
        name: "Research Solar Power",
        description: "todo",
        researchTime: 5,
        cost: {}
    }),
    researchGas: _.merge({}, base, {
        name: "Research Geothermal Power",
        description: "todo",
        researchTime: 10,
        cost: {}
    }),

    solarPanel_largerPanels: _.merge({}, base, {
        name: "Mirrored Panels",

        // TODO don't hardcode values into description, e.g. "Increase energy production by {{ multiplier * 100 }}% ..."
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

