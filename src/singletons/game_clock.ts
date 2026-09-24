import store from "../redux/store";
import {clockTick} from "../redux/modules/clock";
import {batch} from "react-redux";
import {resourcesTick} from "../redux/reducer";
import {upgradesTick, upgradesTickSlow} from "../redux/modules/upgrades";
import {abilitiesTick} from "../redux/modules/abilities";
import {structuresTick} from "../redux/modules/structures";
import {planetTick} from "../redux/modules/planet";
import {panelsTick} from "../redux/modules/panels";
import {catchUp, type CatchUpJob, type CatchUpSummary} from "../lib/catch_up";
import {dayLength} from "../redux/modules/clock";
import {updateSetting} from "../redux/modules/game";
import {logInline} from "../redux/modules/log";
import {saveState} from "../lib/local_storage";
import {formatNumber, typedEntries} from "../lib/helpers";

const CLOCK_FPS = 30;
export const BASE_VIEW_FPS = 10;
export const STAR_FPS = 30;
export const PLANET_FPS = 30;
export const ENERGY_BUTTON_FPS = 60;

const STRUCT_FPS = 10;
const ABILITIES_FPS = 10; // todo this is only for button animation... find a way to reduce

// A frame gap this long means the tab was hidden (the browser pauses requestAnimationFrame) or the page stalled;
// either way the gap is replayed through lib/catch_up.ts rather than lumped into the periodic functions.
const CATCH_UP_THRESHOLD_MS = 1000;
// How much of each frame the catch-up may take before yielding to rendering
const CATCH_UP_FRAME_BUDGET_MS = 30;
// Absences this long announce themselves: an overlay while replaying, a terminal line when done
const CATCH_UP_ANNOUNCE_MS = 30 * 1000;
// Once shown, the overlay stays at least this long so a fast replay reads as a notice rather than a flicker
const CATCH_UP_OVERLAY_MIN_MS = 1000;
// The most game days a hidden tab is credited (about 50 real minutes at the 100 s day). Covers any ordinary reason
// to switch away, while a tab parked overnight doesn't hand over several games' worth of ore and minerals.
const CATCH_UP_MAX_DAYS = 30;

type PeriodicFn = (iterations: number, period: number) => void;

class GameClock {
    /*. Time based variables, all in milliseconds .*/
    now: number;    // Current tick's time
    then: number;   // Last tick's time
    delta: number;  // Time since last tick
    total: number;  // Total time elapsed
    periodicFns: Record<string, { fn: PeriodicFn, period: number, current: number }>; // functions to call periodically
    catchUpJob: { job: CatchUpJob, steps: Generator<void, CatchUpSummary>, overlayShownAt: number | null, capped: boolean } | null; // a hidden-tab replay in progress

    constructor() {
        this.now = Date.now() || (new Date).getTime();
        this.then = Date.now() || (new Date).getTime();
        this.delta = 0;
        this.total = 0;
        this.periodicFns = {};
        this.catchUpJob = null;

        // This just affects time getting stored to store, and how often clock UI will be updated.
        // Can be relatively slow since we only show seconds on the clock anyway.
        this.setInterval('GameClock', (iterations, period) => {
            store.dispatch(clockTick(iterations * period));
        }, 1000 / CLOCK_FPS);

        // Ticks in this block must be done iteratively (one by one in order)
        this.setInterval('Iterative', (iterations, period) => {
            const seconds = period / 1000;

            // TODO if iterations is large, can batch updates into groups of 5, 10, etc.
            batch(() => {
                while (iterations > 0) {
                    store.dispatch(resourcesTick(seconds)); // todo why does this tick deal with 'seconds'
                    store.dispatch(structuresTick(period)); // Cannot be batched since runningCooldown can affect resourcesTick
                    iterations--;
                }
            });
        }, 1000 / STRUCT_FPS);

        // Ticks in this block must be done iteratively (one by one in order), but it is iterated less frequently
        // since it updates slowly
        this.setInterval('IterativeSlow', (iterations, period) => {
            // TODO if iterations is large, can batch updates into groups of 5, 10, etc.
            batch(() => {
                while (iterations > 0) {
                    store.dispatch(planetTick(period));
                    iterations--;
                }
            });
        }, 1000 / CLOCK_FPS) // todo reduce

        // Ticks in this block can be batched into a single update for the entire time period
        // TODO Do these have to be iterative as well? What if an upgrade that boosts production finishes while offline?
        this.setInterval('Summable', (iterations, period) => {
            store.dispatch(upgradesTick(iterations * period));
            store.dispatch(abilitiesTick(iterations * period));
            store.dispatch(panelsTick(iterations * period));
        }, 1000 / ABILITIES_FPS);

        this.setInterval('SummableSlow', (iterations, period) => {
            store.dispatch(upgradesTickSlow(iterations * period));
        }, 1000 / 1);

        this.run();
    }

    /**
     * Register a function to be called every x milliseconds
     * @param key Unique key for the interval. Can be used to clear the interval later.
     * @param fn function to be called periodically with params: (iterations, period)
     * @param period number of milliseconds between intervals
     * @param skipFirstInterval If true, the first call is skipped
     */
    setInterval(key: string, fn: PeriodicFn, period: number, skipFirstInterval = false) {
        this.periodicFns[key] = {
            fn: fn,
            period: period,
            current: skipFirstInterval ? 0 : period
        };
    }

    clearInterval(key: string) {
        delete this.periodicFns[key];
    }

    clearAll() {
        this.periodicFns = {};
    }

    /*. Main clock function .*/
    run() {
        /*. Calculate time since last tick .*/
        this.now = Date.now() || (new Date).getTime(); // Get current time
        this.delta = this.now - this.then; // Get time since last tick
        this.then = this.now; // Reset last tick time
        this.total += this.delta;

        // An uncaught error here must not break the requestAnimationFrame chain below; if it did, one bad tick
        // would silently freeze the game forever (the UI keeps rendering but all clocks stop).
        try {
            if (this.catchUpJob) {
                // Real time keeps passing while we replay; it joins the backlog rather than the periodic functions
                this.catchUpJob.job.remainingMs += this.delta;
                this.catchUpJob.job.totalMs += this.delta;
                this._driveCatchUp();
            }
            else if (this.delta >= CATCH_UP_THRESHOLD_MS) {
                // Game speed (a dev setting) scales the absence the same way it scales a live frame
                this.startCatchUp(this.delta * store.getState().game.gameSpeed);
            }
            else {
                this._iteratePeriodicFns();
            }
        }
        catch (err) {
            console.error('Error during game tick (skipping this frame):', err);
            if (this.catchUpJob) {
                // Abandon the replay rather than retry it every frame; whatever it had applied stays applied
                this.catchUpJob = null;
                if (store.getState().game.catchUp) store.dispatch(updateSetting('catchUp', null));
            }
        }

        /*. Run function again as soon as possible without lagging .*/
        window.requestAnimationFrame(() => this.run())
    }

    /** Replays `ms` of hidden-tab time (up to CATCH_UP_MAX_DAYS), spread over the coming frames (see lib/catch_up.ts) */
    startCatchUp(ms: number) {
        const maxMs = CATCH_UP_MAX_DAYS * dayLength(store.getState().clock) * 1000;
        const capped = ms > maxMs;
        const creditedMs = capped ? maxMs : ms;
        const job: CatchUpJob = { totalMs: creditedMs, remainingMs: creditedMs };
        this.catchUpJob = { job, steps: catchUp(store, job), overlayShownAt: null, capped };
        this._driveCatchUp();
    }

    _driveCatchUp() {
        if (!this.catchUpJob) return;
        const { job, steps } = this.catchUpJob;
        const start = performance.now();
        while (performance.now() - start < CATCH_UP_FRAME_BUDGET_MS) {
            const step = steps.next();
            if (step.done) {
                this._finishCatchUp(step.value);
                return;
            }
        }
        if (job.totalMs >= CATCH_UP_ANNOUNCE_MS) {
            if (this.catchUpJob.overlayShownAt === null) this.catchUpJob.overlayShownAt = performance.now();
            store.dispatch(updateSetting('catchUp', { totalMs: job.totalMs, remainingMs: job.remainingMs }));
        }
    }

    _finishCatchUp(summary: CatchUpSummary) {
        const shownAt = this.catchUpJob?.overlayShownAt ?? null;
        const capped = this.catchUpJob?.capped ?? false;
        this.catchUpJob = null;
        const state = store.getState();
        if (state.game.catchUp) {
            const shownFor = shownAt === null ? Infinity : performance.now() - shownAt;
            const clear = () => store.dispatch(updateSetting('catchUp', null));
            if (shownFor >= CATCH_UP_OVERLAY_MIN_MS) clear();
            else window.setTimeout(clear, CATCH_UP_OVERLAY_MIN_MS - shownFor);
        }
        if (summary.totalMs >= CATCH_UP_ANNOUNCE_MS) {
            store.dispatch(logInline(catchUpSummaryLine(state, summary, capped)));
        }
        // The autosave is throttled; a close right after returning would otherwise lose the whole replay
        if (state.game.autoSaveEnabled && !state.game.endGameSequenceStarted) {
            saveState(store.getState());
        }
    }

    // A periodic function does not run every game loop, it runs every X milliseconds (to improve performance)
    _iteratePeriodicFns() {
        const gameSpeed = store.getState().game.gameSpeed;

        for (const periodicFn of Object.values(this.periodicFns)) {
            if (periodicFn === undefined) {
                // When clearInterval is called, its periodicFn will still be called for the current iteration (the
                // periodicFn will be undefined however). When this happens, ignore the fn. By next iteration
                // it won't be called anymore.
                return;
            }

            periodicFn.current += this.delta;
            if (periodicFn.current >= periodicFn.period) {
                // TODO Calculate this without a while loop
                let iterations = 0;
                while (periodicFn.current >= periodicFn.period) {
                    iterations += 1;
                    periodicFn.current -= periodicFn.period;
                }
                periodicFn.fn(iterations, periodicFn.period * gameSpeed);
            }
        }
    }

}

// "Autonomous 1.1 days: +32.0k Minerals, +4 Droids, -1.2k Ore." The base ran itself; in game days, the terminal's
// own clock (visible resources only, changes under half a unit dropped). A capped absence says so, or twelve hours
// away producing a month's worth reads as a bug.
function catchUpSummaryLine(state: RootState, summary: CatchUpSummary, capped: boolean): string {
    const changes = typedEntries(summary.deltas)
        .filter(([id, delta]) => state.resources.visibleIds.includes(id) && Math.abs(delta) >= 0.5)
        .map(([id, delta]) => `${delta > 0 ? '+' : '-'}${formatNumber(Math.abs(delta), 1, true)} ${state.resources.byId[id]?.name ?? id}`);
    const days = summary.totalMs / 1000 / dayLength(state.clock);
    const away = `Autonomous ${days.toFixed(1)} days${capped ? ' (limit)' : ''}`;
    return changes.length > 0 ? `${away}: ${changes.join(', ')}.` : `${away}.`;
}

const gameClock = new GameClock();

// Dev-console handle: fake an absence without waiting for one (see also window.solarionStore in redux/store.ts)
if (import.meta.env.DEV) {
    window.solarionCatchUp = (ms: number) => gameClock.startCatchUp(ms);
}

export default gameClock;