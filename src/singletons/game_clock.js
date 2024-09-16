import * as Helpers from "../lib/helpers"
import store from "../redux/store";
import {clockTick} from "../redux/modules/clock";
import {batch} from "react-redux";
import {resourcesTick} from "../redux/reducer";
import {upgradesTick, upgradesTickSlow} from "../redux/modules/upgrades";
import {abilitiesTick} from "../redux/modules/abilities";
import {structuresTick} from "../redux/modules/structures";
import {planetTick} from "../redux/modules/planet";

const CLOCK_FPS = 10; // todo affects outside rendering
const STRUCT_FPS = 10;
const ABILITIES_FPS = 5; // todo this is only for button animation... find a way to reduce

class GameClock {
    constructor() {
        // TODO Is this needed with babel?
        /*. Time based variables, all in milliseconds .*/
        this.now = Date.now() || (new Date).getTime(); // Current tick's time
        this.then = Date.now() || (new Date).getTime(); // Last tick's time
        this.delta = 0; // Time since last tick
        this.total = 0; // Total time elapsed
        this.periodicFns = {}; // functions to call periodically

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
            const seconds = period / 1000;

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
    setInterval(key, fn, period, skipFirstInterval) {
        this.periodicFns[key] = {
            fn: fn,
            period: period,
            current: skipFirstInterval ? 0 : period
        };
    }

    clearInterval(key) {
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

        this._iteratePeriodicFns();

        /*. Run function again as soon as possible without lagging .*/
        window.requestAnimationFrame(() => this.run())
    }

    // A periodic function does not run every game loop, it runs every X milliseconds (to improve performance)
    _iteratePeriodicFns() {
        const gameSpeed = store.getState().game.gameSpeed;

        for (const [key, periodicFn] of Object.entries(this.periodicFns)) {
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

export default (new GameClock);