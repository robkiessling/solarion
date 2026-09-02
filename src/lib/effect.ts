/**
 * Effects are objects that modify a resource's `variables`. An example effect might look like:
 *
 * {
 *    ratedPower: {
 *      multiply: 1.25
 *    }
 * }
 *
 * In this example, ratedPower is the variable name and { multiply: 1.25 } are operations performed on the variable.
 *
 * Currently there is no `effects` database; effects are part of a upgrade, ability, etc.
 */


export function initOperations(): EffectOperations {
    return {
        add: [],
        multiply: []
    }
}

export function mergeEffectIntoOperations(effect: Effect, operations: EffectOperations) {
    parseEffect(effect, (variable, operation, value) => {
        operations[operation].push({
            variable: variable,
            value: value
        })
    })
}

export function applyOperationsToVariables(operations: EffectOperations, variables: Variables) {
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
export function applySingleEffect(effect: Effect, variables: Variables) {
    const operations = initOperations();
    mergeEffectIntoOperations(effect, operations);
    applyOperationsToVariables(operations, variables);
}

function parseEffect(effect: Effect, callback: (variable: string, operation: 'add' | 'multiply', value: number) => void) {
    for (const [variable, operations] of Object.entries(effect)) {
        for (const [operation, value] of Object.entries(operations)) {
            callback(variable, (operation as 'add' | 'multiply'), value);
        }
    }
}

