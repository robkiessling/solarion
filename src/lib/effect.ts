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

/** Calculated per-record numbers (see `calculators` in the database files). Keys are the variable names. */
export type Variables = { [variable: string]: number };

/**
 * Effects modify a record's `variables` (see lib/effect.js):
 *     { ratedPower: { multiply: 1.25 }, energy: { add: 1 } }
 */
export type Effect = { [variable: string]: { add?: number; multiply?: number } };

export interface EffectOperation { variable: string; value: number }

export interface EffectOperations { add: EffectOperation[]; multiply: EffectOperation[] }

/** What an upgrade's or ability's effect applies to */
export type EffectTarget =
    | 'structure'  // the entire structure (all of its variables)
    | 'ability'    // one specific ability (all of its variables)
    | 'misc';      // a one-off, applied by hand wherever it is needed

export interface EffectAffects { type: EffectTarget; id?: string }


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

