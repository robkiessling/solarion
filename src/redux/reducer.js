import { combineReducers } from 'redux'

import clock from './modules/clock'
import resources from './modules/resources';
import structures from "./modules/structures";

export default combineReducers({
    clock,
    resources,
    structures
});


// TODO This is where functions that hit many stores would go