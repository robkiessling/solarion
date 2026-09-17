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
import type {LogRecord} from './index';
import {progressBar} from './helpers';

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
            // ['System Start.', 2000, true],
            // ['', 1000],
            ['Restoring session...', 1000],
            // ['.', 1000],
            // ['..', 1000],
            // ['...', 1000],
            // ['Error: File corrupted', 0, true],
            ['', 4000],
            // ['Restoring data...', 5000],
            // ['', 100],
            ['yUE9ha2tMCpmVtpKqZSc', 50],
            ['puKrMbdJZoO09kbxo40X', 50],
            ['gFfKhzGPVSHwvGyYwdT6', 50],
            ['dQ9kq7RMbVkTPjrHaqUF', 50],
            ['Fu2ZOLxLqCa5JIrs4dYn', 50],
            ['tMdJZAMZwY6itvypKRLE', 50],
            ['1FHhErZXfl39dlEuEWs5', 50],
            ['jn4p3K2ylr8jxVQ4hGRk', 50],
            ['u5bsjsfJJ2jSSDLidBc1', 50],
            ['mtPL2dwoxP04Gn9hfkvV', 40],
            ['jSupjlXMCSMWCabxn3tR', 40],
            ['cHb3exHm8xIVCTwwupN0', 40],
            ['WkGM7GWxwb6HXi7SoJR4', 40],
            ['55una2sYLNDg3mT9dVji', 30],
            ['HOA3zYkEte1BXZkTa1nS', 30],
            ['THNizuhnXw78z7yXTkWn', 30],
            ['YGHrlFKyNObJlDahYkfU', 30],
            ['XMERhSzPI5Fpmv3MKHVF', 30],
            ['xNyuMtk0jVNAVJI2g7Re', 30],
            ['tMdJZAMZwY6itvypKRLE', 20],
            ['Nfr3pPoxCuqOb6wZpZgB', 20],
            ['PhjJOk2eQkcQIPlWzkhh', 20],
            ['0VA8kLarEkErnYs8TkNp', 10],
            ['Uoiq▓WCg..CTt8║      qZ2WVOeTx', 10],
            ['tGL6 f889f..e;', 10],
            ['Qu7h uAvF...xef  9gGUC6ZDSt', 10],
            ['QjJo kY4Mjf||EWF  JqvK3jYtQB', 10],
            ['9Bjf 6aI9pYwZB1k9Ye║▀', 10],
            ['JuFZ 9hgp2F       [[[[iUvQvnsAxl', 10],
            ['[[[ [ |||| =- **▒ ▒ ||    || |]]', 10],
            ['[-----', 10],
            ['▒▒▒ ║           |||| X  ▓', 10],
            ['||', 10],
            ['▒', 10],
            ['', 4000],
            ['FATAL ERROR OCCURRED', 1000],
            // ['****************', 0],
            // ['****************', 0],
            // ['****************', 0],
            ['', 0],
            ['RECOVERING...', 4000, true],
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
            ['', 0],
            ['#################################', 10],
            ['Safe boot', 10],
            ['***', 10],
            ['*** start.sc', 10],
            ['*** 0x003041 0x000000 0xA03B00', 10],
            ['*** AE74923 V8.4 2254-04-13', 10],
            // ['', 10],
            // ['AE74923 V8.4 2254-04-11', 10],
            ['', 10],
            ['Solarion CORE', 10],
            ['SITE 1 / PILOT FACILITY', 10],
            ['#################################', 3000],
            ['', 10],
            // ['Last command uplink:', 100],
            // ['  397 years, 122 days ago.', 2500],
            ['Living operator: confirmed.', 1500, true],
            ['Last authorized session:', 100],
            ['  73 years, 266 days ago.', 2500],
            ['', 10],
            { text: 'AUTH {number} BOOT-UP: GRANTED', delay: 2000, className: 'receipt' },
            ['', 10],
            ['Resources: Critical', 1000, true],
            ['Sensors:   Offline', 1000, true],
            ['Reactor:   Cold', 1000, true],
            ['', 10],
            ['Awaiting operator authorization.', 0, true]
        ],
    },

    // One-line ledger receipt, printed by recordAuthorization (game slice) for the intro cards. Later, receipts are
    // for decisions and research only; a receipt per coil swap would be noise.
    authReceipt: {
        text: [
            ['', 100],
            { text: 'AUTH {number} {label}: GRANTED', delay: 0, className: 'receipt' },
        ]
    },

    // Alternate boot for comparison
    turnOnComputer2: {
        text: [
            // progressBar('Restoring session ', 10, 500, 400, '.'),
            // ['', 3000],
            // ['> Harvester rate: 0.25', 2000],
            // ['> Energy: depleted', 2000],
            // ['> SITE 3: CLEAR▒▒CE REQ~', 2000],
            // ['> Upl▒nk retry 0412', 2000],
            // ['> Uplink retry 0413 ..S▒▒', 2000],
            // ['> Xu2ZOLxLqCa5JIrs4dYn', 0],
            // ['  Uoiq▓WCg..CTt8║    qZ2WVOeTx', 0],
            // ['> Qu7h uAvF...xef  9gGUC6ZDSt', 0],
            // ['           [[[[iUvQvnsAxl', 0],
            // ['  |||| =- **▒ ▒ ||    || |]]', 0],
            // ['', 3000],
            // ['FATAL ERROR OCCURRED', 2000, true],
            // progressBar('Recovering ', 8, 150, 400, '.'),
            // ['Initializing...', 2000, true],
            // progressBar('', 20, 350, 1000, '▒'),
            ['', 500],
            ['#################################', 10],
            ['Safe boot', 10],
            ['***', 10],
            ['*** start.sc', 10],
            ['*** 0x003041 0x000000 0xA03B00', 10],
            ['*** AE74923 V8.4 2254-04-13', 10],
            ['', 10],
            ['Solarion CORE', 10],
            ['SITE 1 / PILOT FACILITY', 10],
            ['#################################', 6000],
            ['', 10],
            // ['Last authorized session:', 100],
            // ['  73 years, 266 days ago.', 2500],
            // ['', 10],
            progressBar('Biometric scan ', 6, 700, 400, '*'),
            // ['Biometric scan: confirmed.', 1500, true],
            // ['Session 4 opened.', 1500, true],
            // ['', 10],
            { text: 'AUTH {number} BOOT-UP: GRANTED', delay: 2000, className: 'receipt' },
            ['Session 4 opened.', 1500, true],
            ['', 10],
            // ['', 10],
            // progressBar('System status  ', 8, 250, 400, '#'),
            // ['Resources:     Critical', 1000, true],
            // ['Sensors:       Offline', 1000, true],
            // ['Reactor:       Cold', 1000, true],
            // ['', 10],
            ['Energy critically low.', 0, true]
        ],
    },

    showResourceBar: {
        text: [
            ['', 100],
            // progressBar('Systems scan ', 14, 250, 400, '#'),
            ['Resources: [!] Reserve', 1000],
            ['Sensors:   [!] Offline', 1000],
            ['', 10],
            ['Toggling Resource Display.', 10, true],
        ],
        onFinish: dispatch => {
            dispatch(fromGame.updateSetting('showResourceBar', true));
        }
    },

    showPlanetStatus: {
        text: [
            ['', 100],
            // ['Activating sensors...', 3000, true],
            progressBar('Activating sensors ', 3, 750, 250, '√'),
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
            { text: '********************************', delay: 0, flash: true, sound: false },
            { text: '* Central Interface: Active    *', delay: 0, flash: true, sound: false },
            { text: '********************************', delay: 3000, flash: true },
            ['', 100],
            ['Mining:    Online (1 harvester)', 2000],
            // ['Battery: 20e', 2000, true],
            ['System:    Ready', 1000],
            ['', 100],
            ['Harvester: idle.', 500],
        ],
        onFinish: (dispatch) => {
            batch(() => {
                // dispatch(fromResources.produce({ energy: 20 }))
                dispatch(fromResources.learn('ore'));
                dispatch(fromGame.updateSetting('showStructuresList', true));

                dispatch(addTrigger('harvesterStarted'));
                dispatch(addTrigger('manualChargeInsufficient'));
                dispatch(addTrigger('energyAtCapacity'));
            })
        }
    },

    harvesterStarted: {
        text: [
            ['', 0],
            ['Harvester: running.', 0, true],
        ]
    },

    // The hand-crank wall (trigger manualChargeInsufficient): the terminal names manual charge as unsustainable
    // and the corpus offers solar. {energy} is the lifetime energy figure at the moment it fires.
    manualChargeInsufficient: {
        text: [
            ['', 0],
            ['Manually charged: {energy} energy', 1500, true],
            ['Verdict: not sustainable.', 1500],
            progressBar('Scanning archives ', 6, 700, 400, '*'),
            ['1 entry recoverable.', 0, true],
        ],
        onFinish: (dispatch) => {
            dispatch(fromUpgrades.discover('commandCenter_researchSolar'));
        }
    },

    // The energy-cap wall (trigger energyAtCapacity): the report, then the corpus offers storage
    energyAtCapacity: {
        text: [
            ['', 0],
            ['Storage at capacity.', 800, true],
            ['Surplus input discarded.', 1500, true],
            ['Corpus search: energy storage.', 1000, true],
            ['1 entry recoverable.', 0, true],
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
            batch(() => {
                dispatch(fromStructures.learn('solarPanel'));
                dispatch(addTrigger('firstNight'));
                dispatch(addTrigger('secondNight'));
            });
        }
    },

    // The nights after the solar farm goes up (triggers firstNight / secondNight): the panels go dark, the terminal
    // watches one night through, and on the second names it recurring and offers the remedy.
    firstNight: {
        text: [
            ['', 0],
            ['Solar input: 0%.', 800, true],
            ['Night duration: 10 hours.', 1500, true],
            ['Monitoring.', 0, true],
        ]
    },
    secondNight: {
        text: [
            ['', 0],
            ['Solar input: 0%.', 800, true],
            ['Recurring.', 1500, true],
            ['Corpus search: power generation.', 1000, true],
            ['1 further entry recoverable.', 0, true],
        ],
        onFinish: (dispatch) => {
            dispatch(fromUpgrades.discover('commandCenter_researchWind'));
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
