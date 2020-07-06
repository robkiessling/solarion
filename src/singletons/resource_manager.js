// import * as Helpers from "../lib/helpers"
import gameClock from "./game_clock";
import store from "../redux/store";
import {getTotalProduction} from "../redux/modules/structures";
import {produce} from "../redux/modules/resources";
import {mapObject} from "../lib/helpers";

const UPDATES_PER_SECOND = 5;

class ResourceManager {
    constructor() {
        this._setupInterval();
    }

    _setupInterval() {
        gameClock.setInterval('ResourceManager', (iterations, period) => {
            const seconds = iterations * period / 1000;

            const production = mapObject(getTotalProduction(store.getState()), (k, v) => v * seconds);
            store.dispatch(produce(production));

        }, 1000 / UPDATES_PER_SECOND);
    }

}

export default (new ResourceManager);