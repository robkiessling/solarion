import * as Helpers from "../lib/helpers"
import gameClock from "./game_clock";
import store from "../redux/store";
import { consume } from '../redux/modules/resources';

const UPDATES_PER_SECOND = 1;

class ResourceManager {
    constructor() {
        // this._resources = {
        //     minerals: 100,
        // }
        // this._rates = {
        //     minerals: 0
        // }

        // this._setupInterval();
    }

    quantity(resourceKey) {
        // return this._resources[resourceKey];
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
        // return this._resources[resourceKey] !== undefined && this._resources[resourceKey] >= amount;
        return this.quantity(resourceKey) >= amount;
    }
    //
    // // Note: modifyQuantity does no validation; you should validate with hasQuantity first
    // modifyQuantity(resourceKey, amount) {
    //     this._resources[resourceKey] += amount;
    // }

    // getRate(resourceKey) {
    //
    // }
    // modifyRate(resourceKey, amount) {
    //     // todo not going to work
    // }


    // _setupInterval() {
    //     gameClock.setInterval('ResourceManager', (iterations, period) => {
    //         const seconds = iterations * period / 1000;
    //         Helpers.iterateObject(this._resources, (key, quantity) => {
    //             this._resources[key] += seconds * this._rates[key];
    //         });
    //     }, 1000 / UPDATES_PER_SECOND);
    // }

}

export default (new ResourceManager);