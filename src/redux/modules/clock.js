import update from 'immutability-helper';
import {batch} from "react-redux";
import {recalculateState} from "../reducer";
import {roundToDecimal} from "../../lib/helpers";

// todo rename this class planet_clock? or consolidate with planet.js?

// Actions
export const TICK = 'clock/TICK';

const WIND_SPEEDS = [17, 18, 22, 33, 25, 20, 15, 22, 12, 3, 10, 15, 25, 35, 60, 40, 33, 25, 20];
const WIND_STEP_SIZE = 2000; // seconds per step

// const WIND_SPEEDS = [0,20,40,60,80,100]
// const WIND_STEP_SIZE = 2000;

const WIND_STEP_COUNT = 5; // steps per target

const WIND_SPEEDS_SPLAT = [];
WIND_SPEEDS.forEach((speed, index) => {
    if (index === 0) {
        WIND_SPEEDS_SPLAT.push(speed);
        return;
    }

    for (let step = 1; step <= WIND_STEP_COUNT; step++) {
        const prevSpeed = WIND_SPEEDS[index - 1];
        WIND_SPEEDS_SPLAT.push(prevSpeed + (step / WIND_STEP_COUNT) * (speed - prevSpeed));
    }
})

const DAY_LENGTH = 60; // How long (in real time seconds) a day should last
const STARTING_TOD_FRACTION = 0.25;
const STARTING_TOD_SECONDS = DAY_LENGTH * STARTING_TOD_FRACTION;

// Initial State
const initialState = {
    elapsedTime: 0, // in milliseconds
    dayLength: DAY_LENGTH, // in seconds
}

// Reducer
export default function reducer(state = initialState, action) {
    switch (action.type) {
        case TICK:
            return update(state, {
                elapsedTime: { $apply: function(x) { return x + action.payload.timeDelta; } }
            });
        default:
            return state;
    }
}

// Action Creators
// export function clockTick(timeDelta) {
//     return { type: TICK, payload: { timeDelta } };
// }

// Note: This is an example of how to dispatch another action during a reduction
export function clockTick(timeDelta) {
    return (dispatch, getState) => {
        batch(() => {
            const startingDaylight = daylightPercent(getState().clock);
            const startingWindSpeed = windSpeed(getState().clock);

            dispatch({ type: TICK, payload: { timeDelta } });

            // Need to recalculate the state if daylight percentage changed
            if (daylightPercent(getState().clock) !== startingDaylight ||
                windSpeed(getState().clock) !== startingWindSpeed) {
                dispatch(recalculateState());
            }
        });
    }
}

export function dayLength(state) {
    return state.dayLength;
}
export function fractionOfDay(state) {
    const secondsIntoDay = elapsedTime(state) % state.dayLength;
    return secondsIntoDay / state.dayLength;
}
export function dayNumber(state, includeDecimal = false) {
    const day = elapsedTime(state) / state.dayLength + 1
    return includeDecimal ? day : Math.floor(day);
}

function elapsedTime(state) {
    return state.elapsedTime / 1000.0 + STARTING_TOD_SECONDS
}

// duration (fraction of day), label, % daylight
const TIME_PERIODS = [
    [5/24, 'Night', 0],
    [1/24, 'Dawn', 0.25], // 5 - 6
    [4/24, 'Morning', 0.5], // 6 - 10
    [4/24, 'Midday', 1], // 10 - 2
    [4/24, 'Afternoon', 0.75], // 2 - 6
    [1/24, 'Dusk', 0.25], // 6 - 7
    [5/24, 'Night', 0]
];

// Make sure the fractions in the TIME_PERIODS constant add up to 1.0
const totalTime = TIME_PERIODS.reduce((accumulator, period) => accumulator + period[0], 0);
if (roundToDecimal(totalTime, 5) !== 1.0) {
    console.error('The day fractions in the TIME_PERIODS constant do not add up to a full day');
}

export function timePeriodData(fractionOfDay) {
    let counter = 0;

    for (let i = 0; i < TIME_PERIODS.length; i++) {
        counter += TIME_PERIODS[i][0];

        if (fractionOfDay <= counter) {
            return TIME_PERIODS[i];
        }
    }
}
export function timePeriodName(state) {
    return timePeriodData(fractionOfDay(state))[1];
}
export function daylightPercent(state) {
    return timePeriodData(fractionOfDay(state))[2];
}

const MIN_TEMPERATURE = -105;
const MAX_TEMPERATURE = 190;
export function surfaceTemperature(state) {
    return daylightPercent(state) * (MAX_TEMPERATURE - MIN_TEMPERATURE) + MIN_TEMPERATURE;
}

export function windSpeed(state) {
    const step = Math.floor(state.elapsedTime / WIND_STEP_SIZE) % WIND_SPEEDS_SPLAT.length;
    return WIND_SPEEDS_SPLAT[step];
}