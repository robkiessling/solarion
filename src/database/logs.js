import * as fromStructures from '../redux/modules/structures';
import * as fromResources from '../redux/modules/resources';
import * as fromUpgrades from '../redux/modules/upgrades';
import * as fromAbilities from '../redux/modules/abilities';
import * as fromGame from '../redux/modules/game';
import * as fromPlanet from '../redux/modules/planet';
import * as fromReducer from '../redux/reducer';
import {addTrigger} from "../redux/triggers";
import * as fromLog from "../redux/modules/log";
import {batch} from "react-redux";
import {mapObject} from "../lib/helpers";
import {generateMap} from "../redux/modules/planet";
import {generateProbeDist} from "../redux/modules/star";
import {dayNumber} from "../redux/modules/clock";
import {updateSetting} from "../redux/modules/game";

const NORMAL_BOOTUP = 'normalBootup'; // Standard campaign start
const SKIP_START = 'skipStart';
const SKIP_TO_GLOBE = 'skipToGlobe';
const SKIP_EVERYTHING = 'skipEverything'; // Skip to all structures built

const GAME_MODE = SKIP_TO_GLOBE; /* Controls overall game mode */


export default {
    startup: {
        text: [],
        onFinish: (dispatch) => {
            switch (GAME_MODE) {
                case NORMAL_BOOTUP:
                    dispatch(fromLog.startLogSequence('normalBootup'));
                    break;
                case SKIP_START:
                    dispatch(fromLog.startLogSequence('skipStart'));
                    break;
                case SKIP_TO_GLOBE:
                    dispatch(fromLog.startLogSequence('skipToGlobe'));
                    break;
                case SKIP_EVERYTHING:
                    dispatch(fromLog.startLogSequence('skipEverything'));
                    break;
            }
        }
    },

    skipStart: {
        text: [
            ['Skipping start', 0, true],
            ['', 0],
        ],
        onFinish: (dispatch) => {
            dispatch(fromResources.learn('energy'));
            dispatch(fromStructures.learn('commandCenter'));
            dispatch(fromStructures.buildForFree('commandCenter', 1));
            dispatch(fromAbilities.learn('commandCenter_charge'));

            dispatch(fromUpgrades.researchForFree('commandCenter_showTerminal'));
            dispatch(fromUpgrades.researchForFree('commandCenter_showPlanetStatus'));
            dispatch(fromUpgrades.researchForFree('commandCenter_showResourceRates'));
            dispatch(fromUpgrades.researchForFree('commandCenter_openShutters'));
        }
    },

    normalBootup: {
        text: [],
        onFinish: (dispatch) => {
            batch(() => {
                dispatch(fromResources.learn('energy'));
                dispatch(fromStructures.learn('commandCenter'));
                dispatch(fromStructures.buildForFree('commandCenter', 1));
                dispatch(fromAbilities.learn('commandCenter_charge'));
            })
        }
    },

    turnOnComputer: {
        text: [
            ['', 1000],
            ['System Start.', 3000, true],
            ['', 1000],
            // ['Resuming last session...', 3000, true],
            // ['', 100],
            ['Last login: 73 years, 266 days ago', 3000, true],
            ['', 100],
            // ['Restoring data...', 5000],
            // ['', 100],
            // ['yUE9ha2tMCpmVtpKqZSc', 100],
            // ['puKrMbdJZoO09kbxo40X', 100],
            // ['gFfKhzGPVSHwvGyYwdT6', 100],
            // ['dQ9kq7RMbVkTPjrHaqUF', 100],
            // ['Fu2ZOLxLqCa5JIrs4dYn', 100],
            // ['tMdJZAMZwY6itvypKRLE', 100],
            // ['1FHhErZXfl39dlEuEWs5', 100],
            // ['jn4p3K2ylr8jxVQ4hGRk', 100],
            // ['u5bsjsfJJ2jSSDLidBc1', 100],
            // ['mtPL2dwoxP04Gn9hfkvV', 100],
            // ['jSupjlXMCSMWCabxn3tR', 100],
            // ['cHb3exHm8xIVCTwwupN0', 100],
            // ['WkGM7GWxwb6HXi7SoJR4', 100],
            // ['55usa2sYLNDg3mT9dVji', 100],
            // ['HOA3zYkEte1BXZkTa1nS', 100],
            // ['THNizuhnXw78z7yXTkWn', 100],
            // ['YGHrlFKyNObJlDahYkfU', 100],
            // ['XMERhSzPI5Fpmv3MKHVF', 100],
            // ['xNyuMtk0jVNAVJI2g7Re', 100],
            // ['tMdJZAMZwY6itvypKRLE', 100],
            // ['Nfr3pPoxCuqOb6wZpZgB', 100],
            // ['PhjJOk2eQkcQIPlWzkhh', 100],
            // ['0VA8kLarEkErnYs8TkNp', 100],
            // ['Uoiq▓WCg..CTt8║      qZ2WVOeTx', 100],
            // ['tGL6 f889f..e;', 100],
            // ['Qu7h uAvF...xef  9gGUC6ZDSt', 100],
            // ['QjJo kY4Mjf||EWF  JqvK3jYtQB', 100],
            // ['9Bjf 6aI9pYwZB1k9Ye║▀', 100],
            // ['JuFZ 9hgp2F       [[[[iUvQvnsAxl', 100],
            // ['[[[ [ |||| =- **▒ ▒ ||    || |]]', 100],
            // ['[-----', 0],
            // ['▒▒▒ ║           |||| X  ▓', 0],
            // ['||', 0],
            // ['▒', 0],
            // ['', 0],
            // ['FATAL ERROR OCCURRED', 0],
            // ['', 3000],
            // ['****************', 0],
            // ['****************', 0],
            // ['****************', 0],
            // [' ', 0],
            // ['RECOVERING...', 0],
            // ['', 3000],
            // ['Error code: 18589194123098', 0],
            // ['ADDR:', 100],
            // ['[3260 7515 1562]', 0],
            // ['[3064 3772 8098]', 0],
            // ['[6849 7590 4712]', 0],
            // ['[5196 8857 2428]', 0],
            // ['[2598 8722 0112]', 0],
            // ['[5350 6892 8792]', 0],
            // ['[6240 4625 6629]', 0],
            // ['[6433 3822 8854]', 0],
            // ['[0140 5313 1417]', 0],
            // ['', 3500],
            ['#################################', 10],
            ['Safe boot', 10],
            ['***', 10],
            ['*** start.sc', 10],
            ['*** 0x003041 0x000000 0xA03B00', 10],
            ['***', 10],
            ['', 2000],
            ['AE74923 V8.4 2154-04-11', 10],
            ['', 10],
            ['Solarion(R) CORE', 10],
            ['', 10],
            ['#################################', 10],
            ['', 10],
            // ['Resources low.', 10],
            // ['', 10],
        ],
    },

    showPlanetStatus: {
        text: [
            ['Activating sensors...', 3000, true],
            ['', 100],
            ['Sensors are operational.', 100, true],
            ['', 100],
        ],
        onFinish: (dispatch) => {
            dispatch(fromGame.updateSetting('showPlanetStatus', true));
        }
    },

    openShutters: {
        text: [
            ['Lowering blast shield...', 12000, true], // should match $shutter-transition
            ['', 0],
        ],
        onFinish: (dispatch) => {
            batch(() => {
                dispatch(fromLog.startLogSequence('missionStart'));
            })
        }
    },

    missionStart: {
        text: [
            ['********************************', 0, true],
            ['* Activating Central Interface *', 0, true],
            ['********************************', 3000, true],
            ['', 100],
            ['Mining: Operational (1 harvester)', 2000, true],
            ['System: Ready', 1000],
            ['', 100],
            ['Awaiting input...', 0, true],
            ['', 0],
        ],
        onFinish: (dispatch) => {
            batch(() => {
                dispatch(fromResources.learn('ore'));
                dispatch(fromGame.updateSetting('showNonCCBuildings', true));
            })

            addTrigger(
                (state) => state.resources.byId.ore,
                (slice) => slice.lifetimeTotal >= 40,
                () => {
                    dispatch(fromLog.startLogSequence('discoverSolar'));
                }
            )
            addTrigger(
                (state) => state.resources.byId.ore,
                (slice) => slice.lifetimeTotal >= 200,
                () => {
                    dispatch(fromLog.startLogSequence('discoverWindPower'));
                }
            )

            addTrigger(
                (state) => state.resources.byId.energy,
                (slice) => slice.amount >= slice.capacity * 0.9,
                () => {
                    dispatch(fromLog.startLogSequence('energyAlmostFull'));
                }
            )

            addTrigger(
                (state) => state.resources.byId.ore,
                (slice) => slice.lifetimeTotal >= 1000,
                () => {
                    dispatch(fromLog.startLogSequence('unlockRefinery'));
                }
            )
        }
    },

    skipToGlobe: {
        text: [
            ['Skipping to globe', 1, true],
            ['', 0],
        ],
        onFinish: (dispatch) => {
            dispatch(fromGame.updateSetting('shuttersOpen', true));
            dispatch(fromGame.updateSetting('showPlanetStatus', true));
            dispatch(fromGame.updateSetting('showResourceBar', true));
            dispatch(fromGame.updateSetting('showResourceRates', true));
            dispatch(fromGame.updateSetting('showTerminal', true));
            dispatch(fromGame.updateSetting('showNonCCBuildings', true));
            dispatch(fromGame.updateSetting('showStructureTabs', true))

            dispatch(fromResources.learn('energy'));
            dispatch(fromResources.learn('ore'));
            dispatch(fromResources.learn('vents'));
            dispatch(fromResources.learn('refinedMinerals'));
            dispatch(fromResources.learn('standardDroids'));

            dispatch(fromStructures.learn('commandCenter'));
            dispatch(fromStructures.buildForFree('commandCenter', 1));
            dispatch(fromAbilities.learn('commandCenter_charge'));

            dispatch(fromStructures.learn('harvester'));
            dispatch(fromStructures.learn('solarPanel'));
            // dispatch(fromStructures.learn('thermalVent'));
            dispatch(fromStructures.learn('windTurbine'));
            dispatch(fromStructures.learn('energyBay'));
            dispatch(fromStructures.learn('refinery'));
            dispatch(fromStructures.learn('droidFactory'));
            dispatch(fromAbilities.learn('droidFactory_buildStandardDroid'));

            dispatch(fromStructures.buildForFree('harvester', 5));
            dispatch(fromStructures.buildForFree('solarPanel', 7));
            dispatch(fromStructures.buildForFree('windTurbine', 6));
            dispatch(fromStructures.buildForFree('energyBay', 9));
            dispatch(fromStructures.buildForFree('refinery', 2));
            dispatch(fromStructures.buildForFree('droidFactory', 1));

            dispatch(fromUpgrades.researchForFree('energyBay_largerCapacity'));
            dispatch(fromUpgrades.researchForFree('energyBay_largerCapacity2'));

            dispatch(fromResources.produce({
                energy: 999999999,
                ore: 999999999,
                refinedMinerals: 999999999,
                standardDroids: 10
            }));

            addTrigger(
                (state) => state.planet.droidData,
                (slice) => slice.numDroidsAssigned > 0,
                () => {
                    dispatch(fromLog.startLogSequence('startExploringMap'));
                    dispatch(fromPlanet.startExploringMap());
                }
            )

        }
    },
    skipEverything: {
        text: [
            ['Skipping Normal Login', 1, true],
            ['', 1],
            ['All known resources have been loaded.', 0, true]
        ],
        onFinish: (dispatch) => {
            dispatch(fromGame.updateSetting('shuttersOpen', true));
            dispatch(fromGame.updateSetting('showPlanetStatus', true));
            dispatch(fromGame.updateSetting('showResourceBar', true));
            dispatch(fromGame.updateSetting('showTerminal', true));
            dispatch(fromGame.updateSetting('showNonCCBuildings', true));
            // dispatch(fromGame.updateSetting('showStructureTabs', true))

            dispatch(fromResources.learn('energy'));
            dispatch(fromResources.learn('ore'));
            dispatch(fromResources.learn('vents'));
            dispatch(fromResources.learn('refinedMinerals'));
            dispatch(fromResources.learn('standardDroids'));
            dispatch(fromResources.learn('probes'));
            dispatch(fromResources.learn('buildableLand'));
            dispatch(fromResources.learn('developedLand'));

            dispatch(generateMap());
            dispatch(generateProbeDist());

            dispatch(fromStructures.learn('commandCenter'));
            dispatch(fromAbilities.learn('commandCenter_charge'));

            dispatch(fromStructures.learn('harvester'));
            dispatch(fromStructures.buildForFree('harvester', 1));
            dispatch(fromUpgrades.discover('harvester_overclock'));

            // dispatch(fromStructures.learn('sensorTower'));
            dispatch(fromStructures.learn('refinery'));

            dispatch(fromStructures.learn('solarPanel'));
            dispatch(fromStructures.learn('thermalVent'));
            dispatch(fromStructures.learn('windTurbine'));
            dispatch(fromStructures.learn('energyBay'));
            dispatch(fromUpgrades.discover('energyBay_largerCapacity'))

            dispatch(fromStructures.learn('droidFactory'));
            dispatch(fromAbilities.learn('droidFactory_buildStandardDroid'));

            dispatch(fromStructures.learn('probeFactory'));

            dispatch(fromResources.produce({
                ore: 5000,
                energy: 0,
                refinedMinerals: 100,
                standardDroids: 5
            }))

            dispatch(fromGame.addNavTab('outside'));
            dispatch(fromGame.addNavTab('planet'));
            dispatch(fromGame.addNavTab('star'));

            dispatch(fromUpgrades.discover('windTurbine_reduceCutIn'))
            dispatch(fromUpgrades.discover('windTurbine_increaseCutOut'))
            dispatch(fromUpgrades.discover('windTurbine_largerBlades'))
            dispatch(fromUpgrades.discover('windTurbine_yawDrive'))

            dispatch(fromAbilities.learn('replicate'));

            addTrigger(
                (state) => state.planet.droidData,
                (slice) => slice.numDroidsAssigned > 0,
                () => {
                    dispatch(fromPlanet.startExploringMap());
                }
            )
        }
    },

    energyAlmostFull: {
        text: [
            ['Energy stores approaching max capacity. Researching solutions...', 3000, true],
            ['', 0],
            ['New Schematic(s) Found:', 0, true],
            ['- Energy Bay', 0, true],
            ['', 0]
        ],
        onFinish: (dispatch) => {
            // dispatch(fromUpgrades.discover('researchEnergyBay'));

            dispatch(fromStructures.learn('energyBay'));

        }
    },

    discoverSolar: {
        text: [
            ['Manual energy generation insufficient for production.', 3000, true],
            ['', 0],
            ['Researching solutions...', 3000, true],
            ['', 0],
            ['New Schematic(s) Found:', 0, true],
            ['- Solar Panels', 0, true],
            // ['- Wind Turbines', 0, true],
            ['', 0]
        ],
        onFinish: (dispatch) => {
            dispatch(fromStructures.learn('solarPanel'));
        }
    },

    discoverWindPower: {
        text: [
            ['Energy production is too limited at night. Researching solutions...', 3000, true],
            ['', 0],
            ['New Schematic(s) Found:', 0, true],
            ['- Wind Turbines', 0, true],
            ['', 0]
        ],
        onFinish: (dispatch) => {
            dispatch(fromStructures.learn('windTurbine'));
        }
    },

    unlockRefinery: {
        text: [
            ['Need a way to filter rare materials out of ore. Researching solutions...', 3000, true],
            ['', 0],
            ['New Schematic(s) Found:', 0, true],
            ['- Refinery', 0, true],
            ['', 0]
        ],
        onFinish: (dispatch) => {
            dispatch(fromGame.updateSetting('showStructureTabs', true))
            dispatch(fromResources.learn('refinedMinerals'));
            dispatch(fromStructures.learn('refinery'));

            addTrigger(
                (state) => state.resources.byId.refinedMinerals,
                (slice) => slice.lifetimeTotal >= 100,
                () => {
                    dispatch(fromLog.startLogSequence('unlockFactory'));
                }
            )
        }
    },

    unlockFactory: {
        text: [
            ['Enough metal has been gathered to begin artificial synthesis', 3000, true],
            ['', 0],
        ],
        onFinish: (dispatch) => {
            dispatch(fromResources.learn('standardDroids'));
            dispatch(fromStructures.learn('droidFactory'));
            dispatch(fromAbilities.learn('droidFactory_buildStandardDroid'));

            addTrigger(
                (state) => state.planet.droidData,
                (slice) => slice.numDroidsAssigned > 0,
                () => {
                    dispatch(fromLog.startLogSequence('startExploringMap'));
                    dispatch(fromPlanet.startExploringMap());
                }
            )
        }
    },

    globeUnlocked: {
        text: [
            ['Booting up global map...', 3000, true],
            ['', 0],
            ['World view online.', 3000, true],
            ['', 0],
        ],
    },

    startExploringMap: {
        text: [
            ['Dispatching droid(s).', 3000, true],
            ['', 0],
        ],
        onFinish: (dispatch) => {
            addTrigger(
                (state) => state.resources.byId.developedLand,
                (slice) => slice.amount >= 100,
                () => {
                    dispatch(fromUpgrades.discover('windTurbine_global'));
                }
            )
            addTrigger(
                (state) => state.resources.byId.developedLand,
                (slice) => slice.amount >= 500,
                () => {
                    dispatch(fromUpgrades.discover('solarPanel_global'));
                }
            )
            addTrigger(
                (state) => state.resources.byId.refinedMinerals,
                (slice) => slice.amount >= 1e6,
                () => {
                    dispatch(fromLog.startLogSequence('unlockLauncher'));
                }
            )
        }
    },

    unlockLauncher: {
        text: [
            ['Mineral supplies sufficient.', 3000, true],
            ['', 0],
            ['Begin primary mission: Solarion', 3000, true],
            ['', 0],
        ],
        onFinish: (dispatch) => {
            dispatch(fromResources.learn('probes'));
            dispatch(fromStructures.learn('probeFactory'));

            addTrigger(
                (state) => state.structures.byId.probeFactory,
                (slice) => slice.count.total >= 1,
                () => {
                    dispatch(fromGame.addNavTab('star'));
                }
            )
        }
    },

    gameEnd: {
        text: [
            ['Simulation END', 2000, true],
            [''],
            ['This is the end of the current game implementation...', 2000],
            [''],
            ['Thank you for playing.', 2000]
        ]
    }

}