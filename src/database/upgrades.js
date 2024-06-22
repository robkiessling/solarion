
import * as fromResources from "../redux/modules/resources";
import * as fromStructures from "../redux/modules/structures";
import * as fromLog from "../redux/modules/log"
import * as fromUpgrades from "../redux/modules/upgrades";
import {addTrigger} from "../redux/triggers";

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
    },
    researchEnergyBay: {
        onFinish: (dispatch) => {
            dispatch(fromStructures.learn('energyBay'));
            dispatch(fromLog.logMessage('researchComplete'))

            addTrigger(
                (state) => state.resources.byId.energy,
                (slice) => slice.capacity >= 700,
                () => {
                    dispatch(fromUpgrades.discover('energyBay_largerCapacity'));
                }
            )
        }
    }
}

export default {
    researchSolar: _.merge({}, base, {
        standalone: true,
        name: "Research Solar Power",
        description: "Find ways to produce energy based on sunlight. Only viable during daylight hours.",
        researchTime: 15,
        cost: {
            minerals: 50
        }
    }),
    researchWind: _.merge({}, base, {
        standalone: true,
        name: "Research Wind Power",
        description: "Find ways to produce energy based on the planet's wind and atmosphere.",
        researchTime: 10,
        cost: {
            energy: 50,
            minerals: 50
        }
    }),
    researchGas: _.merge({}, base, {
        standalone: true,
        name: "Research Geothermal Power",
        description: "Find ways to produce energy based on exhaust from the planet's surface.",
        researchTime: 10,
        cost: {
            energy: 50,
            minerals: 100
        }
    }),
    researchEnergyBay: _.merge({}, base, {
        standalone: true,
        name: "Research Energy Bays",
        description: "Research potential structures for energy storage.",
        researchTime: 10,
        cost: {
            energy: 100,
            minerals: 100
        }
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
        description: "Increase energy bay capacity by 300%.",
        cost: {
            minerals: 1000
        },
        multiplier: 3
    })
};

