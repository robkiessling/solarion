import update from 'immutability-helper';
import {withRecalculation} from "../reducer";
import {generateRandomMap} from "../../lib/planet_map";

// Actions
export const GENERATE_MAP = 'planet/GENERATE_MAP';
export const PROGRESS = 'planet/PROGRESS';
export const START_NEXT_SECTOR = 'planet/START_NEXT_SECTOR';
export const FINISH_CURRENT_SECTOR = 'planet/FINISH_CURRENT_SECTOR';

// Initial State
const initialState = {
    map: [],
    currentSector: [],
    currentSectorProgress: 0,
    currentSectorResources: {}
}

// Reducer
export default function reducer(state = initialState, action) {
    const payload = action.payload;

    switch (action.type) {
        case GENERATE_MAP:
            return update(state, {
                map: { $set: generateRandomMap() }
            })

        case START_NEXT_SECTOR:
            // find next available sector

            return update(state, {
                currentSector: { $set: [1,2] },
                currentSectorProgress: { $set: 0 },
                currentSectorResources: { $set: {} }
            });
        default:
            return state;
    }
}


// Action Creators
export function generateMap() {
    return { type: GENERATE_MAP };
}



// Standard functions
