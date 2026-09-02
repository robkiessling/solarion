// System/terminal chatter: bootup, unlock notifications, milestone lines. Story-site logs live in
// story.ts; the ending cinematic chain lives in cutscenes.ts; dev skip modes live in src/dev/skips.ts.
import * as fromStructures from '../../redux/modules/structures';
import * as fromResources from '../../redux/modules/resources';
import * as fromUpgrades from '../../redux/modules/upgrades';
import * as fromAbilities from '../../redux/modules/abilities';
import * as fromGame from '../../redux/modules/game';
import * as fromPlanet from '../../redux/modules/planet';
import {addTrigger} from "../../redux/modules/triggers";
import * as fromLog from "../../redux/modules/log";
import * as fromStar from "../../redux/modules/star";
import {batch} from "react-redux";

export default {
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
            // ['', 200],
            ['System Start.', 2000, true],
            ['', 100],
            ['Last login: 73 years, 266 days ago', 3000],
            ['', 100],
            // ['Restoring session...', 1000],
            // ['.', 1000],
            // ['..', 1000],
            // ['...', 1000],
            // ['Error: File corrupted', 0, true],
            // ['', 4000],
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
            // ['Uoiq▓WCg..CTt8║      qZ2WVOeTx', 0],
            // ['tGL6 f889f..e;', 0],
            // ['Qu7h uAvF...xef  9gGUC6ZDSt', 0],
            // ['QjJo kY4Mjf||EWF  JqvK3jYtQB', 0],
            // ['9Bjf 6aI9pYwZB1k9Ye║▀', 0],
            // ['JuFZ 9hgp2F       [[[[iUvQvnsAxl', 0],
            // ['[[[ [ |||| =- **▒ ▒ ||    || |]]', 0],
            // ['[-----', 0],
            // ['▒▒▒ ║           |||| X  ▓', 0],
            // ['||', 0],
            // ['▒', 0],
            // ['', 0],
            // ['FATAL ERROR OCCURRED', 4000, true],
            // ['****************', 0],
            // ['****************', 0],
            // ['****************', 0],
            // ['', 0],
            // ['RECOVERING...', 4000, true],
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
            // ['', 0],
            ['#################################', 10],
            ['Safe boot', 10],
            ['***', 10],
            ['*** start.sc', 10],
            ['*** 0x003041 0x000000 0xA03B00', 10],
            ['*** AE74923 V8.4 2154-04-13', 10],
            // ['', 10],
            // ['AE74923 V8.4 2154-04-11', 10],
            ['', 10],
            ['Solarion CORE', 10],
            // ['', 10],
            ['#################################', 5000],
            ['', 10],
            ['Resources: Critical', 1000, true],
            ['Sensors: Offline', 1000, true],
            ['', 10],
            ['More energy required.', 0, true]
        ],
    },

    showResourceBar: {
        text: [
            ['', 100],
            ['Resource status activated.', 3000, true],
        ]
    },

    showPlanetStatus: {
        text: [
            ['', 100],
            ['Activating sensors...', 3000, true],
            ['', 100],
            ['Sensors are operational.', 100, true],
        ],
        onFinish: (dispatch) => {
            dispatch(fromGame.updateSetting('showPlanetStatus', true));
        }
    },

    openShutters: {
        text: [
            ['', 0],
            ['Lowering blast shield...', 12000, true], // should match $shutter-transition
        ],
        onFinish: (dispatch) => {
            batch(() => {
                dispatch(fromLog.startLogSequence('missionStart'));
            })
        }
    },

    missionStart: {
        text: [
            ['', 0],
            ['********************************', 0, true],
            ['* Activating Central Interface *', 0, true],
            ['********************************', 3000, true],
            ['', 100],
            ['Mining:  Operational (1 harvester)', 2000, true],
            ['Battery: 20e', 2000, true],
            ['System:  Ready', 1000],
            ['', 100],
            ['Harvester awaiting input...', 0, true],
        ],
        onFinish: (dispatch) => {
            batch(() => {
                dispatch(fromResources.produce({ energy: 20 }))
                dispatch(fromResources.learn('ore'));
                dispatch(fromGame.updateSetting('showStructuresList', true));

                dispatch(addTrigger('energyAlmostFull'));
            })
        }
    },

    energyAlmostFull: {
        text: [
            ['', 0],
            ['Energy stores approaching max capacity.', 1000, true],
        ],
        onFinish: (dispatch) => {
            dispatch(fromUpgrades.discover('commandCenter_researchEnergyBay'));
        }
    },

    researchedSolarPower: {
        text: [
            ['', 0],
            ['New Schematic Developed:', 0, true],
            ['- Solar Panels', 0, true],
        ],
        onFinish: (dispatch) => {
            dispatch(fromStructures.learn('solarPanel'));
        }
    },

    researchedWindPower: {
        text: [
            ['', 0],
            ['New Schematic Developed:', 0, true],
            ['- Wind Turbines', 0, true],
        ],
        onFinish: (dispatch) => {
            dispatch(fromStructures.learn('windTurbine'));
        }
    },

    researchedEnergyBay: {
        text: [
            ['', 0],
            ['New Schematic Developed:', 0, true],
            ['- Energy Bay', 0, true],
        ],
        onFinish: (dispatch) => {
            dispatch(fromStructures.learn('energyBay'));
        }
    },
    researchedRefinery: {
        text: [
            ['', 0],
            ['New Schematic Developed:', 0, true],
            ['- Refinery', 0, true],
        ],
        onFinish: (dispatch) => {
            dispatch(fromGame.updateSetting('showStructureTabs', true))
            dispatch(fromResources.learn('refinedMinerals'));
            dispatch(fromStructures.learn('refinery'));
        }
    },

    researchedDroidFactory: {
        text: [
            ['', 0],
            ['New Schematic Developed:', 0, true],
            ['- Droid Factory', 0, true],
        ],
        onFinish: (dispatch) => {
            dispatch(fromResources.learn('standardDroids'));
            dispatch(fromStructures.learn('droidFactory'));
            dispatch(fromAbilities.learn('droidFactory_buildStandardDroid'));

            dispatch(addTrigger('startExploringMap'))
        }
    },

    globeUnlocked: {
        text: [
            ['', 0],
            ['********************************', 0, true],
            ['Planetary Map', 0, true],
            ['********************************', 500, true],
            ['', 0],
            ['Initializing planetary map ...', 3000, true],
            ['', 0],
            ['View Added: [[ Planet ]]', 1000, true],
            ['Exploration Progress: 0.08%', 1000, true],
        ],
    },

    startExploringMap: {
        text: [
            ['', 0],
            ['Dispatching droid(s).', 100, true],
        ],
        onFinish: (dispatch) => {
            dispatch(addTrigger('windTurbine_global'))
            dispatch(addTrigger('solarPanel_global'))
            dispatch(fromPlanet.startExploringMap());
        }
    },

    surveyAutomationOnline: {
        text: [
            ['', 0],
            ['Survey Automation: ONLINE', 0, true],
            ['', 0],
            ['Scout remotes draw power and guidance from the grid uplink.', 1000, true],
            ['Assigned scouts will survey unexplored ground within uplink range (shown on the map).', 1500, true],
            ['Growth beacon enabled: click the map to aim replication.', 1500, true],
        ],
    },

    researchedProbeFactory: {
        text: [
            ['', 0],
            ['********************************', 0, true],
            ['Primary Mission: Solarion', 0, true],
            ['********************************', 500, true],
            ['', 0],
            ['View Added: [[ Solarion ]]', 1000, true],
            ['Orbital Trajectories: Finalized', 1000, true],
            ['Launching Mechanism: Pending', 1000, true],
        ],
        onFinish: (dispatch) => {
            dispatch(fromStar.generateProbeDist());

            dispatch(fromResources.learn('probes'));
            dispatch(fromStructures.learn('probeFactory'));

            dispatch(fromGame.addNavTab('star'));

            dispatch(addTrigger('probeFactoryBuilt'))
            dispatch(addTrigger('probeLaunched'))
            dispatch(addTrigger('solarPanelReceivingProbes'))
        }
    },

    probeFactoryBuilt: {
        text: [
            ['', 1000],
            ['Launcher activated.', 100, true],
        ],
        onFinish: (dispatch) => {
            dispatch(addTrigger('swarm50Pct'));
            dispatch(addTrigger('swarm75Pct'));
            dispatch(addTrigger('swarmComplete'));
        }
    },

    probeLaunched: {
        text: [
            ['', 100],
            ['Probe(s) have successfully entered Solarion\'s orbit.', 100, true],
            ['', 5000],
            ['Analyzing energy capabilities...', 1000],
        ],
    },

    solarPanelProbeReady: {
        text: [
            ['', 1000],
            ['Solar Farms equipped to receive photon beams.', 100, true],
        ],
    },

    solarPanelReceivingProbes: {
        text: [
            ['', 100],
            ['Mirroring 1% of solar output to planetary receivers.', 3000, true],
            ['', 100],
            ['- Available energy is nearly limitless.', 3000, true],
            ['- Energy storage no longer necessary.', 3000, true],
        ],
    },

    swarm50Pct: {
        text: [
            ['', 100],
            ['Swarm 50% complete.', 100, true],
        ],
    },
    swarm75Pct: {
        text: [
            ['', 100],
            ['Swarm 75% complete.', 100, true],
        ],
    },

    swarmComplete: {
        text: [
            ['', 100],
            ['Swarm is fully operational.', 100, true],
        ],
        onFinish: dispatch => {
            dispatch(fromStructures.disable('probeFactory'));
            dispatch(fromUpgrades.discover('probeFactory_finalSequence'));
        }
    }
} satisfies Record<string, LogRecord>;
