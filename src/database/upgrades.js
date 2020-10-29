
import * as fromResources from "../redux/modules/resources";
import * as fromStructures from "../redux/modules/structures";
import * as fromLog from "../redux/modules/log"

export const STATES = {
    hidden: 0,
    silhouetted: 1,
    discovered: 2,
    researching: 3,
    paused: 4,
    researched: 5
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
            dispatch(fromLog.logMessage('researchComplete'))
        }
    },
    researchWind: {
        onFinish: (dispatch) => {
            dispatch(fromStructures.learn('windTurbine'));
            dispatch(fromLog.logMessage('researchComplete'))
        }
    },
    researchGas: {
        onFinish: (dispatch) => {
            dispatch(fromResources.learn('vents'));
            dispatch(fromStructures.learn('thermalVent'));
            dispatch(fromLog.logMessage('researchComplete'))
        }
    }
}

export default {
    researchSolar: _.merge({}, base, {
        standalone: true,
        name: "Research Solar Power",
        description: "Find ways to produce energy based on sunlight. Only viable during daylight hours.",
        researchTime: 15,
        cost: {}
    }),
    researchWind: _.merge({}, base, {
        standalone: true,
        name: "Research Wind Power",
        description: "Find ways to produce energy based on the planet's wind and atmosphere.",
        researchTime: 15,
        cost: {}
    }),
    researchGas: _.merge({}, base, {
        standalone: true,
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

