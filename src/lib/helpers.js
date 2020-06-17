
// Iterates through the keys of the object, calling the given function on each (key, value) pair
export function iterateObject(obj, fn) {
    if (obj) {
        Object.keys(obj).forEach((key) => {
            fn.call(this, key, obj[key]);
        });
    }
}

// Call a method such that, inside the method, 'this' refers to the target parameter
export function makeCallback(target, method) {
    return function () {
        return method.apply(target, arguments);
    };
}

