
import * as fromResources from "../redux/modules/resources";
import * as fromStructures from "../redux/modules/structures";
import * as fromLog from "../redux/modules/log"
import * as fromUpgrades from "../redux/modules/upgrades";
import * as fromAbilities from "../redux/modules/abilities";
import {addTrigger} from "../redux/triggers";
import {EFFECT_TARGETS} from "../lib/effect";
import {getIconSpan} from "../redux/modules/resources";

export const STATES = {
    hidden: 0,
    // silhouetted: 1,
    discovered: 2,
    researching: 3,
    paused: 4,
    researched: 5
}

const base = {
    name: 'Unknown',
    description: "",
    researchTime: 0, // if 0, research will occur instantly
    state: STATES.hidden,

    // Possible options -- discoverWhen: { resources: { x/y/z }, upgrades: [], structures: { x/y/z} }
    // If resources is defined, the upgrade will be automatically discovered once lifetime resource totals pass these values
    // If structures is defined, the upgrade will be automatically discovered once structure build count pass these values
    // If upgrades is defined, those upgrades need to be already researched before this will be discovered
    discoverWhen: undefined,
    
    effect: undefined,
    affects: {
        type: EFFECT_TARGETS.structure
        // No default id necessary; if blank it is assumed to be the upgrade's structure
    }
}

// TODO don't hardcode values into description, e.g. "Increase energy production by {{ multiplier * 100 }}% ..."
// Note: 'effect' keys correspond to structure calculated variables
const database = {
    harvester_drill1: _.merge({}, base, {
        name: "Upgrade Drill #1",
        structure: 'harvester',
        description: "Increases ore production by 20%",
        discoverWhen: {
            resources: {
                ore: 500
            }
        },
        cost: {
            ore: 700
        },
        effect: {
            ore: { multiply: 1.2 },
        }
    }),
    harvester_drill2: _.merge({}, base, {
        name: "Upgrade Drill #2",
        structure: 'harvester',
        description: "Increases ore production by 30%",
        discoverWhen: {
            resources: {
                ore: 3000
            },
            upgrades: ['harvester_drill1']
        },
        cost: {
            ore: 1200,
            refinedMinerals: 10
        },
        effect: {
            ore: { multiply: 1.3 },
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

        description: "Increase solar panel energy production by 50%.",
        discoverWhen: {
            structures: {
                solarPanel: 3
            },
            resources: {
                energy: 1000
            }
        },
        cost: {
            ore: 500
        },
        effect: {
            peakEnergy: { multiply: 1.5 }
        },
    }),


    energyBay_largerCapacity: _.merge({}, base, {
        name: "Flux Capacitors",
        structure: 'energyBay',
        description: "Increase energy bay capacity by 300%.",
        discoverWhen: {
            structures: {
                energyBay: 5
            }
        },
        cost: {
            ore: 1000
        },
        effect: {
            capacity: { multiply: 3 }
        }
    }),
    energyBay_production1: _.merge({}, base, {
        name: "Power Linking I",
        structure: 'energyBay',
        // description: `Increases overall ${getIconSpan('energy', true)} production by 3% per Energy Bay`,
        description: `Increases overall energy production by 3% per Energy Bay`,
        discoverWhen: {

        },
        cost: {

        },
        effect: {
            energyBoost: { add: 0.03 }
        }
    }),
    energyBay_production2: _.merge({}, base, {
        name: "Power Linking II",
        structure: 'energyBay',
        // description: `Increases ${getIconSpan('energy', true)} production boost to 5%`,
        description: `Increases energy production boost to 5%`,
        discoverWhen: {
            upgrades: ['energyBay_production1']
        },
        cost: {

        },
        effect: {
            energyBoost: { add: 0.02 } // going from 3% to 5%
        }
    }),

    windTurbine_reduceCutIn: _.merge({}, base, {
        name: "Advanced Blades",
        structure: 'windTurbine',
        description: "Improves the turbine's power output at low wind speeds.",
        discoverWhen: {
            resources: {
                refinedMinerals: 10
            }
        },
        cost: {
            ore: 1000,
            refinedMinerals: 25
        },
        effect: {
            cutInSpeed: { add: -5 }
        }
    }),
    windTurbine_increaseCutOut: _.merge({}, base, {
        name: "Hyper Motor",
        structure: 'windTurbine',
        description: "Increases the turbine's max wind speed tolerance by 20 mph",
        discoverWhen: {
            resources: {
                refinedMinerals: 10
            }
        },
        cost: {
            ore: 1000,
            refinedMinerals: 25
        },
        effect: {
            cutOutSpeed: { add: 20 }
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
    droidFactory_improvedMaintenance: _.merge({}, base, {
        name: "Improved Maintenance",
        structure: 'droidFactory',
        description: 'Doubles the effectiveness of droids assigned to structures',
        discoverWhen: {
            resources: {
                standardDroids: 5
            }
        },
        cost: {
            ore: 1
        },
        affects: {
            type: EFFECT_TARGETS.misc
        },
        effect: {
            boost: { multiply: 2 }
        }
    }),
    droidFactory_fasterBuild: _.merge({}, base, {
        name: "Faster Builds",
        structure: 'droidFactory',
        description: 'Reduces build time by 5s',
        discoverWhen: {
            resources: {
                standardDroids: 5
            }
        },
        cost: {
            ore: 1
        },
        affects: {
            type: EFFECT_TARGETS.ability,
            id: 'droidFactory_buildStandardDroid'
        },
        effect: {
            castTime: { add: -5 }
        }
    })
};

export default database;


// Functions can't be stored in the state so storing them in this const
export const callbacks = {
    // researchSolar: {
    //     onFinish: (dispatch) => {
    //         dispatch(fromStructures.learn('solarPanel'));
    //         dispatch(fromLog.logMessage('researchComplete'))
    //     }
    // },

    harvester_overclock: {
        onFinish: (dispatch) => {
            dispatch(fromAbilities.learn('harvester_overclock'));
        }
    }
}


// A lookup of upgrades that AFFECT a structure
// Format: { structureId => [upgrade1, upgrade2, ...], ... }
export const upgradesAffectingStructure = {}

// A lookup of upgrades that AFFECT an ability
// Format: { abilityId => [upgrade1, upgrade2, ...], ... }
export const upgradesAffectingAbility = {}

for (const [upgradeId, upgradeDbRecord] of Object.entries(database)) {
    switch(upgradeDbRecord.affects.type) {
        case EFFECT_TARGETS.structure:
            // If `affects` obj has no id we default to affecting the upgrade's structure
            const structureId = upgradeDbRecord.affects.id || upgradeDbRecord.structure;
            if (upgradesAffectingStructure[structureId] === undefined) {
                upgradesAffectingStructure[structureId] = []
            }
            upgradesAffectingStructure[structureId].push(upgradeId);
            break;
        case EFFECT_TARGETS.ability:
            const abilityId = upgradeDbRecord.affects.id;
            if (upgradesAffectingAbility[abilityId] === undefined) {
                upgradesAffectingAbility[abilityId] = []
            }
            upgradesAffectingAbility[abilityId].push(upgradeId);
            break;
    }
}
