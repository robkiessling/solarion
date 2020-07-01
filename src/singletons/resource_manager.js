import * as Helpers from "../lib/helpers"
import gameClock from "./game_clock";
import store from "../redux/store";
import { consume, generate } from '../redux/modules/resources';

const UPDATES_PER_SECOND = 5;

class ResourceManager {
    constructor() {
        this._resetCache();
        this._setupInterval();
    }

    quantity(resourceKey) {
        return store.getState().resources[resourceKey].amount;
    }

    consume(resourceKey, amount) {
        if (this.hasQuantity(resourceKey, amount)) {
            store.dispatch(consume(resourceKey, amount));
            return true;
        }
        else {
            return false;
        }
    }

    hasQuantity(resourceKey, amount) {
        return this.quantity(resourceKey) >= amount;
    }

    getRate(resourceKey) {
        if (this._cache[resourceKey] && this._cache[resourceKey].net !== undefined) {
            return this._cache[resourceKey].net;
        }
    }

    _resetCache() {
        this._cache = {};
    }

    _setupInterval() {
        gameClock.setInterval('ResourceManager', (iterations, period) => {
            const seconds = iterations * period / 1000;

            // Helpers.iterateObject(this._resources, (key, quantity) => {
            //     this._resources[key] += seconds * this._rates[key];
            // });

            // store.dispatch(generate('minerals', 10 * seconds));
        }, 1000 / UPDATES_PER_SECOND);
    }

}

export default (new ResourceManager);