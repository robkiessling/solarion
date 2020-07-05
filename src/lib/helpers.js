

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