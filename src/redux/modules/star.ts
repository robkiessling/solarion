import update from 'immutability-helper';
import {recalculateState, withRecalculation} from "../reducer";
import {generateRandomProbeDist} from "../../lib/star";

export const TARGETS: { NONE: 'none', PLANET: 'planet' } = {
    NONE: 'none',
    PLANET: 'planet'
}
export const TARGET_LABELS = {
    [TARGETS.NONE]: 'None',
    [TARGETS.PLANET]: 'Planet',
}

// Actions
export const GENERATE_PROBE_DIST = 'star/GENERATE_PROBE_DIST';
export const UPDATE_SETTING = 'star/UPDATE_SETTING';

// Initial State
const initialState: StarState = {
    distribution: [],
    mirrorsOnline: false,
    mirrorTarget: TARGETS.NONE,
    hyperBeamStartedAt: null,
}

// Reducer
export default function reducer(state: StarState = initialState, action: GameAction): StarState {
    const payload = action.payload;

    switch (action.type) {
        case GENERATE_PROBE_DIST:
            return update(state, {
                distribution: { $set: payload.distribution }
            })
        case UPDATE_SETTING:
            return update(state, {
                [payload.key]: { $set: payload.value }
            });
        default:
            return state;
    }
}


// Action Creators
export function generateProbeDist() {
    const distribution = generateRandomProbeDist();
    return { type: GENERATE_PROBE_DIST, payload: { distribution } };
}

export function updateSetting(key, value) {
    return { type: UPDATE_SETTING, payload: { key, value } }
}

export function aimMirrors(target) {
    return withRecalculation(updateSetting('mirrorTarget', target));
}

export function startEnergyBeam(time) {
    return { type: UPDATE_SETTING, payload: { key: 'hyperBeamStartedAt', value: time } }
}

export function isTargetingPlanet(state: StarState): boolean {
    return state && state.mirrorTarget && state.mirrorTarget === TARGETS.PLANET;
}
