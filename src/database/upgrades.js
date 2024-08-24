
import * as fromResources from "../redux/modules/resources";
import * as fromStructures from "../redux/modules/structures";
import * as fromLog from "../redux/modules/log"
import * as fromUpgrades from "../redux/modules/upgrades";
import * as fromAbilities from "../redux/modules/abilities";
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
    researchTime: 0, // if 0, research will occur instantly
    state: STATES.hidden
}

// TODO don't hardcode values into description, e.g. "Increase energy production by {{ multiplier * 100 }}% ..."
// 'effect' keys correspond to structure calculated variables
export default {
    researchSolar: _.merge({}, base, {
        standalone: true,
        name: "Research Solar Power",
        description: "Find ways to produce energy based on sunlight. Only viable during daylight hours.",
        researchTime: 15,
        cost: {
            ore: 50
        }
    }),
    researchWind: _.merge({}, base, {
        standalone: true,
        name: "Research Wind Power",
        description: "Find ways to produce energy based on the planet's wind and atmosphere.",
        researchTime: 10,
        cost: {
            energy: 50,
            ore: 50
        }
    }),
    researchGas: _.merge({}, base, {
        standalone: true,
        name: "Research Geothermal Power",
        description: "Find ways to produce energy based on exhaust from the planet's surface.",
        researchTime: 10,
        cost: {
            energy: 50,
            ore: 100
        }
    }),
    researchEnergyBay: _.merge({}, base, {
        standalone: true,
        name: "Research Energy Bays",
        description: "Research potential structures for energy storage.",
        researchTime: 10,
        cost: {
            energy: 100,
            ore: 100
        }
    }),

    harvester_overclock: _.merge({}, base, {
        name: "Research: Overclock",
        structure: 'harvester',

        description: "Learn the <span class='underline'>Overclock</span> ability, allowing you to briefly run the " +
            "Harvester at a higher rate.",
        cost: {
            ore: 10
        }
    }),

    solarPanel_largerPanels: _.merge({}, base, {
        name: "Larger Panels",
        structure: 'solarPanel',

        description: "Increase solar panel energy production by 300%.",
        cost: {
            ore: 10
        },
        effect: {
            peakEnergy: { multiply: 3 }
        }
    }),


    energyBay_largerCapacity: _.merge({}, base, {
        name: "Flux Capacitors",
        structure: 'energyBay',
        description: "Increase energy bay capacity by 300%.",
        cost: {
            ore: 1000
        },
        effect: {
            capacity: { multiply: 3 }
        }
    }),

    windTurbine_reduceCutIn: _.merge({}, base, {
        name: "Advanced Blades",
        structure: 'windTurbine',
        description: "Improves the turbine's power output at low wind speeds.",
        cost: {
            ore: 1000
        },
        effect: {
            cutInSpeed: { add: -3 }
        }
    }),
    windTurbine_increaseCutOut: _.merge({}, base, {
        name: "Hyper Motor",
        structure: 'windTurbine',
        description: "Increases the turbine's max wind speed tolerance by 25 mph",
        cost: {
            ore: 1000
        },
        effect: {
            cutOutSpeed: { add: 25 }
        }
    }),
    windTurbine_largerBlades: _.merge({}, base, {
        name: "Larger Blades",
        structure: 'windTurbine',
        description: "Increase energy production by 25%",
        cost: {
            ore: 1000
        },
        effect: {
            ratedPower: { multiply: 1.25 }
        }
    }),
    windTurbine_yawDrive: _.merge({}, base, {
        name: "Yaw Drive",
        structure: 'windTurbine',
        description: "Allows the wind turbine to rotate towards the wind's direction, increasing energy production by 30%",
        cost: {
            ore: 1000
        },
        effect: {
            ratedPower: { multiply: 1.3 }
        }
    }),
};


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
    },

    harvester_overclock: {
        onFinish: (dispatch) => {
            dispatch(fromAbilities.learn('harvester_overclock'));
        }
    }
}