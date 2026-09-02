// The ending cinematic: a chain of log sequences (mostly empty text + delays) driving the final
// animation stages. The log system doubles as the cutscene sequencer; delays here are choreography.
import * as fromGame from '../../redux/modules/game';
import * as fromPlanet from '../../redux/modules/planet';
import * as fromLog from "../../redux/modules/log";
import {kickoffDoomsday} from "../../redux/reducer";
import {COOK_TIME} from "../../lib/planet_map";
import type {LogRecord} from './index';

export default {
    finalSequence_start: {
        text: [
            ['', 0],
            ['********************************', 0, true],
            ['Initiating Control Sequence', 0, true],
            ['********************************', 1000, true],
            ['', 0],
            ['Disabling remote access...', 5000, true],
            ['Complete.', 1000, true],
            ['', 0],
            ['Planetary assistance is no longer required.', 5000, true],
            ['', 0],
            ['Commencing purification protocol:', 4000, true],
            ['> Redirecting 100% of solar output.', 4000, true],
        ],
        onFinish: dispatch => {
            dispatch(kickoffDoomsday());
        }
    },

    finalSequence_planet1: {
        text: [
            ['', 0],
            ['Goodbye.', 10000, true], // star animation
        ],
        onFinish: dispatch => {
            dispatch(fromPlanet.setRotationMode('sun'));
            dispatch(fromGame.updateSetting('hideUI', true));
            dispatch(fromGame.updateSetting('currentNavTab', 'planet'))
            dispatch(fromLog.startLogSequence('finalSequence_planet2'))
        }
    },
    finalSequence_planet2: {
        text: [
            ['', 4000] // wait before blowing up planet
        ],
        onFinish: dispatch => {
            dispatch(fromPlanet.startCooking());
            dispatch(fromLog.startLogSequence('finalSequence_outside1'))
        }
    },
    finalSequence_outside1: {
        text: [
            ['', COOK_TIME] // cook planet animation
        ],
        onFinish: dispatch => {
            dispatch(fromPlanet.startCooking());
            dispatch(fromGame.updateSetting('burnOutside', true));
            dispatch(fromGame.updateSetting('currentNavTab', 'outside'))
            dispatch(fromLog.startLogSequence('finalSequence_outside2'))
        }
    },
    finalSequence_outside2: {
        text: [
            ['', 5000] // cook outside animation
        ],
        onFinish: dispatch => {
            // dispatch(fromGame.updateSetting('hideCanvas', true));
            dispatch(fromGame.updateSetting('fadeToBlack', true));
            dispatch(fromLog.startLogSequence('finalSequence_gameOver'))
        }
    },
    finalSequence_outside3: {
        text: [
            ['', 8000] // wait for canvas to hide
        ],
        onFinish: dispatch => {
            dispatch(fromGame.updateSetting('fadeToBlack', true));
            dispatch(fromLog.startLogSequence('finalSequence_gameOver'))
        }
    },
    finalSequence_gameOver: {
        text: [
            ['', 10000] // waiting on fade to black
        ],
        onFinish: dispatch => {
            dispatch(fromGame.updateSetting('gameOver', true));
        }
    }
} satisfies Record<string, LogRecord>;
