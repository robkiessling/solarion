
export const MODIFIER_DEFAULTS = {
    base: 0,
    add: 0,
    multiply: 1
}
const MODIFIER_FUNCTIONS = {
    add: (x, modValue) => x + modValue,
    multiply: (x, modValue) => x * modValue
}

export function getModifiedTotal(data) {
    // return (function(base = MODIFIER_DEFAULTS.base, add = MODIFIER_DEFAULTS.add, multiply = MODIFIER_DEFAULTS.multiply) {
    //     return (base + add) * multiply;
    // })(data.base, data.add, data.multiply);

    // Does same as commented out IIFE above; less readable but might be a little faster
    return (
        (data.base === undefined ? MODIFIER_DEFAULTS.base : data.base) +
        (data.add === undefined ? MODIFIER_DEFAULTS.add : data.add)
    ) * (data.multiply === undefined ? MODIFIER_DEFAULTS.multiply : data.multiply);
}

/**
 *
 * @param modifications Should be an object such as:
 *  {
 *      add: 10,
 *      multiply: 2
 *  }
 * @returns An object to be passed to immutability-helper's `update` function
 */
export function mergeModifications(modifications) {
    return mapObject(modifications, (modType, modValue) => (
        {
            $apply: function(x) {
                if (x === undefined) {
                    x = MODIFIER_DEFAULTS[modType];
                }
                return MODIFIER_FUNCTIONS[modType](x, modValue);
            }
        }
    ))
}

/**
 * Applies the modifications (same param as mergeModifications) at a particular depth in the state.
 * For example, if part of the state was:

    energy: {
        capacity: {
            base: 100
        }
    }

 * We could update the { base: 100 } modifications area by calling this function with a depth of 2.
 * @param modifications See mergeModifications for spec
 * @param depth How deep we need to traverse into the object
 * @returns An object to be passed to immutability-helper's `update` function
 */
export function mergeModsAtDepth(modifications, depth) {
    if (depth === 0) {
        return mergeModifications(modifications);
    }
    else {
        return mapObject(modifications, (key, value) => (
            mergeModsAtDepth(value, depth - 1)
        ));
    }
}


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

// Maps an object to a new object https://stackoverflow.com/a/14810722/4904996
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

// Rounds to nearest int
export const round = (num) => {
    return roundToDecimal(num, 0);
};


// Set functions
export const a_minus_b = (a, b) => {
    return new Set([...a].filter(x => !b.has(x)));
}
export const a_intersect_b = (a, b) => {
    return new Set([...a].filter(x => b.has(x)));
}
