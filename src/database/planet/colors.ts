/**
 * The planet view's palette. Colors used to live in base_view.scss as tile classNames; the canvas needs them
 * in JS, so this is the source of truth (the DOM legend, the HUD and the terminal's terrain notes read it too).
 */
import type {SquadZone} from "./terrain";

export type PlanetColorKey = keyof typeof PLANET_COLORS;
export const PLANET_COLORS = {
    unknown: '#8793a5',   // fog: dim and cool (blue-grey), so warm flatland reads as new ground next to it
    home: '#20d9ff',
    outpost: '#20d9ff', // a secured site: the player's own ground now, in the base's colour
    flatland: '#7f5d47',  // dusty clay: warm like the mountains but desaturated, so ground recedes yet never matches the cool fog
    developing: '#8c8c8c',    // replicating: inert grey until the cast finishes and the tiles power up
    developed: '#6fd3b0',  // grown land; the same hue toned down so a built-up day side doesn't outshout the terrain
    developedNight: '#ffb455', // city lights: replicated land warms toward sodium amber as daylight falls
    mountain: '#e07f30',  // the horizon peaks' orange in the base view (backgrounds.planet), so it is the same rock
    ice: '#ffffff',
    shallows: '#86d5fb', // a bridgeable strait: lighter and greener than the sea, so the gap reads as a way across
    water: '#2f6b8f',    // open sea: deep steel blue, cooler and bluer than the fog so unexplored ground never reads as coast
    held: '#d94f8c', // held ground around a settlement (retracts when it is cleared): rose, kin to the settlement's red and clear of the story sites' purple
    droid: '#ffe14d',
    droidReturning: '#9a9a9a', // recalled scouts walking home ("off duty")
    laserBeam: '#ffff00',

    // Expedition overlays (POI markers, squad, skirmish effect)
    poiCache: '#ffd700',
    poiSettlement: '#ff4d4d',
    poiCamp: '#ff4d4d', // same red as the settlement it belongs to; the lowercase glyph tells them apart
    poiStory: '#c58fff',
    poiTunnel: '#e0c060',
    poiFieldEvent: '#ff9f40', // a field event that has gone off (or, with SHOW_CONCEALED_POIS, one still waiting): amber, between cache gold and battle orange
    poiHighlight: '#ffffff',
    squad: '#20d9ff',    // friendly cyan like home base; keeps the squad readable next to yellow scouts
    battle: '#ff6b35',
    haloRing: '#3ec0da', // survey-range boundary (stroked cell-edge segments, not a char tint)
    beacon: '#6fd3b0'    // growth beacon; matches developed land, which grows toward it
} satisfies Record<string, string>;

// The map colour of a squad zone (a terrain key, 'held', or 'grid' for powered ground). DOM chrome that
// echoes the ground the squad is on (terminal terrain notes, the HUD, the frame rim) reads this instead of
// restating the hex in scss, so the palette has one home.
export function zoneColor(zone: SquadZone) {
    return PLANET_COLORS[zone === 'grid' ? 'home' : zone];
}

// Radar pings: expanding, fading rings around a cell. 'hover' is the loud attention ping on a hovered POI
// marker; 'squad' is the quiet always-on locator pulse that lets you follow a deployed expedition team.
export type PingVariantId = 'hover' | 'squad' | 'beacon';
export type PingVariant = { color: string, maxRadiusCells: number, lineWidth: number, rings: number, maxAlpha: number };
export const PING_VARIANTS: Record<PingVariantId, PingVariant> = {
    hover: { color: '#7fe3f5', maxRadiusCells: 2.2, lineWidth: 1.5, rings: 2, maxAlpha: 1 },
    squad: { color: '#20d9ff', maxRadiusCells: 1.5, lineWidth: 1, rings: 1, maxAlpha: 0.45 },
    beacon: { color: PLANET_COLORS.beacon, maxRadiusCells: 1.8, lineWidth: 1, rings: 1, maxAlpha: 0.5 }
};
