import {clockTick} from "../redux/modules/clock";
import {resourcesTick} from "../redux/reducer";
import {structuresTick} from "../redux/modules/structures";
import {planetTick} from "../redux/modules/planet";
import {upgradesTick} from "../redux/modules/upgrades";
import {abilitiesTick} from "../redux/modules/abilities";
import {panelsTick} from "../redux/modules/panels";

/** The economy's simulation step (ms). The live frame loop runs the economy at this period; replays use it too. */
export const TICK_MS = 100;
/** Period (ms) of the slow checks (upgrade discovery) */
export const SLOW_TICK_MS = 1000;

/**
 * Advances every clock-driven system by one step of `dt` ms, in the order the live frame loop dispatches them
 * (clock first, so the tick's daylight and wind are the ones its production is computed at). The frame loop itself
 * runs these on their own periods (see singletons/game_clock.ts); a replay of hidden-tab time (lib/catch_up.ts)
 * steps them all together at TICK_MS.
 */
export function tickGame(dispatch: Dispatch, dt: number) {
    dispatch(clockTick(dt));
    dispatch(resourcesTick(dt / 1000));
    dispatch(structuresTick(dt));
    dispatch(planetTick(dt));
    dispatch(upgradesTick(dt));
    dispatch(abilitiesTick(dt));
    dispatch(panelsTick(dt));
}
