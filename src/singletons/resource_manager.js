// import * as Helpers from "../lib/helpers"
import gameClock from "./game_clock";
import store from "../redux/store";
import {applyTime} from "../redux/reducer";
import {batch} from 'react-redux';

const UPDATES_PER_SECOND = 10;

class ResourceManager {
    constructor() {
        this._setupInterval();
    }

    _setupInterval() {
        gameClock.setInterval('ResourceManager', (iterations, period) => {
            // TODO if iterations is large, can batch updates into groups of 5, 10, etc.
            batch(() => {
                while (iterations > 0) {
                    this._update(period);
                    iterations--;
                }
            });
        }, 1000 / UPDATES_PER_SECOND);
    }

    _update(period) {
        const seconds = period / 1000;

        // For each structure:
        //      1) try to consume. if CAN -> consume it AND produce what those structures can
        //      2) if cannot consume -> DON'T produce and DON'T consume
        store.dispatch(applyTime(seconds));
    }

}

export default (new ResourceManager);