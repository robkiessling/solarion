import React from "react";

/**
 * Iterates through the keys of the object, calling the given function on each (key, value) pair.
 *
 * TODO Can remove this function, it is no longer needed. Just use this instead:
 *
 *          for (const [key, value] of Object.entries(obj)) {
 *              // do something using key/value
 *          }
 */
// export function iterateObject(obj, fn) {
//     if (obj) {
//         Object.keys(obj).forEach((key) => {
//             fn.call(this, key, obj[key]);
//         });
//     }
// }

// TODO just use lodash debounce instead https://lodash.com/docs/4.17.15#debounce
export function debounce(func, delayMs = 100){
    let timer;

    return function(event) {
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(func, delayMs, event);
    };
}

// Faster than `element.innerHTML = '';`
export function emptyElement(element) {
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
}

// Maps an object to a new object https://stackoverflow.com/a/14810722
// TODO just use lodash map values?
export const mapObject = (obj, fn) => {
    return Object.fromEntries(
        Object.entries(obj).map(
            ([k, v], i) => [k, fn(k, v, i)]
        )
    )
}

const EPSILON = 0.000001; // Adding an epsilon to handle floating point rounding errors
export const roundToDecimal = (num, numDecimals) => {
    if (numDecimals === 0) {
        return Math.round(num + EPSILON)
    }
    else {
        const factor = Math.pow(10, numDecimals);
        return Math.round((num + EPSILON) * factor) / factor;
    }
};

// Rounds a float to 5 decimals. This should be used before any comparisons (e.g. < <= > >=) because of floating point rounding errors
export const roundForComparison = (num) => {
    return roundToDecimal(num, 5);
};

export const compareNumbers = (num1, operation, num2) => {
    switch(operation) {
        case '>':
            return roundForComparison(num1) > roundForComparison(num2);
        case '>=':
            return roundForComparison(num1) >= roundForComparison(num2);
        case '<':
            return roundForComparison(num1) < roundForComparison(num2);
        case '<=':
            return roundForComparison(num1) <= roundForComparison(num2);
        case '===':
            return roundForComparison(num1) === roundForComparison(num2);
        default:
            console.warn('invalid operation: ', operation);
            return false;
    }
}

// Rounds to nearest int
export const round = (num) => {
    return roundToDecimal(num, 0);
};

const NUMBER_FORMAT_LOOKUP = [
    { value: 1, symbol: "" },
    { value: 1e3, symbol: "k" },
    { value: 1e6, symbol: "M" },
    { value: 1e9, symbol: "G" },
    { value: 1e12, symbol: "T" },
    { value: 1e15, symbol: "P" },
    // { value: 1e18, symbol: "E" },
    // { value: 1e21, symbol: "Z" }
];
const DROP_ZEROS_REGEX = /\.0+$|(?<=\.[0-9]*[1-9])0+$/;

// Adapted from https://stackoverflow.com/a/9462382
export function formatNumber(num, decimalDigits = 1, dropZeros = false) {
    let isNegative = false;
    if (num < 0) {
        isNegative = true;
        num *= -1;
    }

    const item = NUMBER_FORMAT_LOOKUP.findLast(item => num >= item.value);
    let str;

    if (item) {
        str = (num / item.value).toFixed(decimalDigits);
    }
    else {
        // Number is between 0 and 1:
        str = num ? num.toFixed(decimalDigits) : '0';
    }

    if (dropZeros) {
        str = str.replace(DROP_ZEROS_REGEX, '');
    }

    if (isNegative) {
        str = `-${str}`
    }

    if (item) {
        str = `${str}${item.symbol}`
    }

    return str;
}

export function formatInteger(num, dropZeros = false) {
    // Only show decimal place when number is greater than 1000 (i.e. it starts showing a symbol like "k" or "M")
    // return (Math.abs(num) < 1e3) ? formatNumber(num, 0) : formatNumber(num, 1);

    return formatNumber(num, 1, dropZeros);
}

// The maximum is inclusive and the minimum is inclusive
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random#getting_a_random_integer_between_two_values_inclusive
export function getRandomIntInclusive(min, max) {
    const minCeiled = Math.ceil(min);
    const maxFloored = Math.floor(max);
    return Math.floor(Math.random() * (maxFloored - minCeiled + 1) + minCeiled);
}

export function getRandomFromArray(array) {
    return array[Math.floor(Math.random() * array.length)];
}


// Need to use this (instead of num % mod) if the starting num can be negative
// https://stackoverflow.com/a/17323608
export function mod(num, mod) {
    return ((num % mod) + mod) % mod;
}


// Set functions
export const a_minus_b = (a, b) => {
    return new Set([...a].filter(x => !b.has(x)));
}
export const a_intersect_b = (a, b) => {
    return new Set([...a].filter(x => b.has(x)));
}


// @param defaultValue can be a primitive value (like an integer or string) or a function that returns the desired value.
// Do not pass an object as a default value; otherwise all the elements will be a reference to the same object. You
// should pass a function that returns a new object.
export function createArray(size, defaultValue = null) {
    let array = [];

    for (let i = 0; i < size; i++) {
        array.push(_.isFunction(defaultValue) ? defaultValue(i) : defaultValue);
    }

    return array;
}

// https://stackoverflow.com/a/12646864
export function shuffleArray(array) {
    for (let i = array.length - 1; i >= 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

export function getDynamicValue(value, functionParams) {
    return typeof value === 'function' ? value(...functionParams) : value;
}


export function redText(text) {
    return `<span class="text-red">${text}</span>`
}

// Returns a color that is a partially between two other colors
// param startColor/endColor should be an rgb array (e.g. [255, 255, 0])
export function getIntermediateColor(startColor, endColor, pct) {
    const color = startColor.map((startValue, index) => {
        const endValue = endColor[index];
        return pct * (endValue - startValue) + startValue;
    });
    return `rgb(${color[0]},${color[1]},${color[2]})`
}
