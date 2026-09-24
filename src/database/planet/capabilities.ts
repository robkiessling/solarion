/**
 * Capabilities: the tools the squad can own. Each is permanent once held. Stored as planet.capabilities (a set), read
 * by two gates: a terrain's `requires` (database/planet/terrain.ts) makes the ground impassable until the tool is
 * held, and a POI's `requires` (database/planet/poi_types.ts) seals the site until it is. Granted by a base upgrade
 * (its onFinish dispatches grantCapability) or by salvage at a POI (reward.capability).
 */
export type Capability = 'drill' | 'overrideModule' | 'amphibious';

export type Capabilities = Partial<Record<Capability, true>>;

export const CAPABILITY_LABELS: Record<Capability, string> = {
    drill: 'Plasma Drill',
    overrideModule: 'Override Module',
    amphibious: 'Amphibious Tracks'
};
