import * as Helpers from "../lib/helpers"
import gameClock from "./game_clock";

const UPDATES_PER_SECOND = 1;

class Resources {
    constructor() {
        this._resources = {
            minerals: 100,
        }
        this._rates = {
            minerals: 0
        }

        this._setupInterval();
    }

    currentQuantity(resourceKey) {
        return this._resources[resourceKey];
    }

    consume(resourceKey, amount) {
        if (this.hasQuantity(resourceKey, amount)) {
            this.modifyQuantity(resourceKey, -amount);
            return true;
        }
        else {
            return false;
        }
    }

    hasQuantity(resourceKey, amount) {
        return this._resources[resourceKey] !== undefined && this._resources[resourceKey] >= amount;
    }

    // Note: modifyQuantity does no validation; you should validate with hasQuantity first
    modifyQuantity(resourceKey, amount) {
        this._resources[resourceKey] += amount;
    }

    // getRate(resourceKey) {
    //
    // }
    // modifyRate(resourceKey, amount) {
    //     // todo not going to work
    // }


    _setupInterval() {
        gameClock.setInterval('Resources', (iterations, period) => {
            const seconds = iterations * period / 1000;
            Helpers.iterateObject(this._resources, (key, quantity) => {
                this._resources[key] += seconds * this._rates[key];
            });
        }, 1000 / UPDATES_PER_SECOND);
    }

}

export default (new Resources);