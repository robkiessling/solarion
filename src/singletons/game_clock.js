import * as Helpers from "../lib/helpers"
import store from "../redux/store";
import {tick} from "../redux/modules/clock";

class GameClock {
    constructor() {
        // TODO Is this needed with babel?
        /*. Time based variables, all in milliseconds .*/
        this.now = Date.now() || (new Date).getTime(); // Current tick's time
        this.then = Date.now() || (new Date).getTime(); // Last tick's time
        this.delta = 0; // Time since last tick
        this.total = 0; // Total time elapsed
        this.periodicFns = {}; // functions to call periodically

        // This affects time getting stored to store, and how often clock UI will be updated.
        // Can be relatively slow (1s) since we only show seconds on the clock anyway.
        this.setInterval('GameClock', (iterations, period) => {
            store.dispatch(tick(iterations * period));
        }, 1000);

        this.run();
    }

    /**
     * Register a function to be called every x milliseconds
     * @param key: Unique key for the interval. Can be used to clear the interval later.
     * @param fn: function to be called periodically with params: (iterations, period)
     * @param period: number of milliseconds between intervals
     * @param skipFirstInterval: If true, the first call is skipped
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
        window.requestAnimationFrame(Helpers.makeCallback(this, this.run));
    }

    // A periodic function does not run every game loop, it runs every X milliseconds (to improve performance)
    _iteratePeriodicFns() {
        Helpers.iterateObject(this.periodicFns, (key, periodicFn) => {
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
                periodicFn.fn(iterations, periodicFn.period);
            }
        });
    }

}

export default (new GameClock);