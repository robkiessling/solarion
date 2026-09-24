/**
 * The squad's terminal lines: what the classifier prints for things the player is not standing in front of
 * (anything they are looking at narrates through the encounter popup instead). Each is a template over
 * the numbers the planet module has already worked out. PLACEHOLDER copy until the content pass.
 */

/** "3 of 6 units" or "3 droids": the roster noun follows the replication multiplier */
export function unitNoun(multiplier: number) {
    return multiplier > 1 ? 'units' : 'droids';
}

export const TELEMETRY = {
    teamReturned: (roster: string, delivered: string | null) =>
        `Team returned to base (${roster}).${delivered ? ` Delivered ${delivered}.` : ''}`,
    /** roster with replication in force: units alive of units fielded, droids recovered of droids sent */
    rosterMultiplied: (unitsAlive: number, unitsFielded: number, droidsRecovered: number, droidsSent: number) =>
        `${unitsAlive} of ${unitsFielded} units — ${droidsRecovered} of ${droidsSent} droids recovered`,
    rosterPlain: (droidsRecovered: number) => `${droidsRecovered} droids`,
    sealed: (name: string, tool: string) => `${name} is sealed — requires ${tool}.`,
    signalTracedNone: () => 'Signal traced: no source within range.',
    signalTraced: (name: string) => `Signal traced: ${name.toLowerCase()} marked on the map.`,
    teamWithdrew: (name: string, levelsCleared: number) =>
        `Team withdrew from ${name} with level ${levelsCleared} cleared.`,
    organicDiscarded: (kg: number) => `ORGANIC MATERIAL: ${kg.toLocaleString()} kg. NO VALUE. DISCARDED.`,
    siteSecured: (site: number) => `Site ${site} secured. Power tap: live. Production: none.`,
    teamLost: (name: string, inTunnel: boolean, cargoLost: string | null) =>
        `Team lost ${inTunnel ? 'in' : 'assaulting'} ${name}.${cargoLost ? ` Cargo lost: ${cargoLost}.` : ''}`,
    teamFellBack: (name: string, survivors: number, fielded: number, noun: string) =>
        `Team fell back from ${name} — ${survivors} of ${fielded} ${noun} escaped.`,
    teamCrossed: (name: string) => `Team crossed ${name}.`,
    teamLostInField: (unitsLost: number, noun: string, cargoLost: string | null) =>
        `Team lost in the field — battery spent, all ${unitsLost} ${noun} gone dark.` +
        (cargoLost ? ` Cargo lost: ${cargoLost}.` : ''),
    cargoBanked: (list: string) => `Cargo banked: ${list}.`
};
