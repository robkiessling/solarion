import React from 'react';
import {connect} from "react-redux";
import {HELD_GLYPH, STATUSES, TERRAINS} from "../database/planet/terrain";
import {PLANET_COLORS} from "../database/planet/colors";
import {getAbility} from "../redux/modules/abilities";

/**
 * Key to the ground glyphs on the globe. Terrain drives movement cost and battery drain, so it stays spelled
 * out; it lives pinned at the foot of the right column (reference material, out of the map's frame) next to
 * the Expedition panel's live terrain readout, sharing its color vocabulary.
 */
// The legend's order. Home and the fog are always there; every other terrain appears once a tile of it has been
// explored (the player has seen the glyph before the key explains it).
const TERRAIN_ORDER = ['flatland', 'mountain', 'ice', 'water', 'shallows', 'outpost'];

// Which terrains have been explored, recomputed only when the explored count changes (the map is a few
// thousand tiles; scanning it every render would be wasteful)
let seenCache = { numExplored: -1, map: null, seen: new Set() };
function terrainsSeen(planet) {
    if (seenCache.map === planet.map && seenCache.numExplored === planet.numExplored) return seenCache.seen;
    const seen = new Set();
    planet.map.forEach(row => row.forEach(sector => {
        if (sector.status === STATUSES.explored.key) seen.add(sector.terrain);
    }));
    seenCache = { numExplored: planet.numExplored, map: planet.map, seen };
    return seen;
}

class TerrainLegend extends React.Component {
    render() {
        const entries = [TERRAINS.home, STATUSES.unknown];
        TERRAIN_ORDER.forEach(key => { if (this.props.seen.has(key)) entries.push(TERRAINS[key]); });
        if (this.props.replicationKnown) {
            entries.push(TERRAINS.developed);
        }
        if (this.props.anyPoiVisible) {
            entries.push({ key: 'held', display: HELD_GLYPH, label: 'Hostile territory' });
        }

        return (
            <div className="terrain-legend">
                <span className="legend-title">Terrain</span>
                {entries.map(entry =>
                    <span key={entry.key} style={{color: PLANET_COLORS[entry.colorKey || entry.key]}}>
                        {entry.display} {entry.label}
                    </span>
                )}
            </div>
        );
    }
}

const mapStateToProps = (state) => {
    return {
        seen: terrainsSeen(state.planet),
        replicationKnown: !!getAbility(state.abilities, 'replicate'),
        // The held entry only appears once relevant (any POI discovered), same rule as the map's marker key
        anyPoiVisible: Object.values(state.planet.pois || {}).some(poi => poi.status !== 'hidden')
    };
};

export default connect(mapStateToProps, {})(TerrainLegend);
