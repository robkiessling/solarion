import update from 'immutability-helper';
import {withRecalculation} from "../reducer";
import {generateRandomProbeDist, type ProbeDistribution} from "../../lib/star";

/** Where the probe swarm's mirrors aim their beam */
export type MirrorTarget = 'none' | 'planet';

export interface StarState {
    /** the probe swarm's [angle, radius] pairs (see generateRandomProbeDist in lib/star.ts) */
    distribution: ProbeDistribution;
    mirrorsOnline: boolean;
    mirrorTarget: MirrorTarget;
    hyperBeamStartedAt: number | null;
}

export const TARGET_LABELS: Record<MirrorTarget, string> = {
    none: 'None',
    planet: 'Planet',
}

// Actions
export const GENERATE_PROBE_DIST = 'star/GENERATE_PROBE_DIST' as const;
export const UPDATE_SETTING = 'star/UPDATE_SETTING' as const;

export type StarAction =
    | { type: typeof GENERATE_PROBE_DIST; payload: { distribution: StarState['distribution'] } }
    | { type: typeof UPDATE_SETTING; payload: { key: keyof StarState; value: StarState[keyof StarState] } };

// Initial State
const initialState: StarState = {
    distribution: [],
    mirrorsOnline: false,
    mirrorTarget: 'none',
    hyperBeamStartedAt: null,
}

// Reducer
export default function reducer(state: StarState = initialState, action: GameAction): StarState {
    switch (action.type) {
        case GENERATE_PROBE_DIST:
            return update(state, {
                distribution: { $set: action.payload.distribution }
            })
        case UPDATE_SETTING:
            return update(state, {
                [action.payload.key]: { $set: action.payload.value }
            });
        default:
            return state;
    }
}


// Action Creators
export function generateProbeDist(): StarAction {
    const distribution = generateRandomProbeDist();
    return { type: GENERATE_PROBE_DIST, payload: { distribution } };
}

export function updateSetting<K extends keyof StarState>(key: K, value: StarState[K]): StarAction {
    return { type: UPDATE_SETTING, payload: { key, value } }
}

export function aimMirrors(target: MirrorTarget) {
    return withRecalculation(updateSetting('mirrorTarget', target));
}

export function startEnergyBeam(time: number): StarAction {
    return { type: UPDATE_SETTING, payload: { key: 'hyperBeamStartedAt', value: time } }
}

export function isTargetingPlanet(state: StarState): boolean {
    return state && state.mirrorTarget && state.mirrorTarget === 'planet';
}
