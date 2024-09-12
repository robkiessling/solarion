/**
 * Effects are objects that modify a resource's `variables`. An example effect might look like:
 *
 * {
 *    ratedPower: {
 *      multiply: 1.25
 *    }
 * }
 *
 * In this example, ratedPower is the variable name and { multiple: 1.25 } are operations performed on the variable.
 *
 * Currently there is no effects database; effects are part of a upgrade, ability, etc.
 */


export const EFFECT_TARGETS = {
    structure: 0, // Affects the entire structure (all structure variables)
    ability: 1, // Affects a specific ability (all variables of that ability)
    misc: 2 // Affects a one-off thing, will be applied manually
}

export function initOperations() {
    return {
        add: [],
        multiply: []
    }
}

export function mergeEffectIntoOperations(effect, operations) {
    parseEffect(effect, (variable, operation, value) => {
        operations[operation].push({
            variable: variable,
            value: value
        })
    })
}

export function applyOperationsToVariables(operations, variables) {
    // Have to add first, then multiply
    operations.add.forEach(operation => {
        variables[operation.variable] += operation.value;
    })
    operations.multiply.forEach(operation => {
        variables[operation.variable] *= operation.value;
    })
}

// Applies a single effect to the variables.
// Note: This should not be used in sequence with other applyEffect calls; if you do this you may accidentally apply multiplication
//       before addition. See `applyAllEffects` function(s) for an example of how to correctly apply multiple effects.
export function applySingleEffect(effect, variables) {
    const operations = initOperations();
    mergeEffectIntoOperations(effect, operations);
    applyOperationsToVariables(operations, variables);
}

function parseEffect(effect, callback) {
    for (const [variable, operations] of Object.entries(effect)) {
        for (const [operation, value] of Object.entries(operations)) {
            callback(variable, operation, value);
        }
    }
}

