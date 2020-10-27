import update from 'immutability-helper';
import {batch} from "react-redux";
import {recalculateState} from "../reducer";

// Actions
export const TICK = 'clock/TICK';

const WIND_SPEEDS = [17, 18, 22, 33, 25, 20, 15, 22, 12, 3, 10, 15, 25, 35, 60, 40, 33, 25, 20];
const WIND_STEP_SIZE = 10000; // seconds per step

// const WIND_SPEEDS = [0,10,20,30,40,50,60,70]
// const WIND_STEP_SIZE = 1000;

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

// Initial State
const initialState = {
    elapsedTime: 0, // in milliseconds
    dayLength: 60 * 1, // in seconds
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
    const secondsIntoDay = (state.elapsedTime / 1000.0) % state.dayLength;
    return secondsIntoDay / state.dayLength;
}
export function dayNumber(state) {
    return Math.floor((state.elapsedTime / 1000.0) / state.dayLength) + 1;
}

// duration, label, % daylight
const TIME_PERIODS = [
    [4/24, 'Night', 0],
    [1/24, 'Dawn', 0.5],
    [5/24, 'Morning', 0.75],
    [4/24, 'Midday', 1],
    [5/24, 'Afternoon', 0.75],
    [1/24, 'Dusk', 0.5],
    [4/24, 'Night', 0]
];
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