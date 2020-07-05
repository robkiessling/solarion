// import * as Helpers from "../lib/helpers"
import gameClock from "./game_clock";
import store from "../redux/store";
import {getTotalProduction} from "../redux/modules/structures";
import {generate} from "../redux/modules/resources";

const UPDATES_PER_SECOND = 5;

class ResourceManager {
    constructor() {
        this._setupInterval();
    }

    _setupInterval() {
        gameClock.setInterval('ResourceManager', (iterations, period) => {
            const seconds = iterations * period / 1000;

            const production = getTotalProduction(store.getState()) * seconds;
            store.dispatch(generate('minerals', production));
        }, 1000 / UPDATES_PER_SECOND);
    }

}

export default (new ResourceManager);