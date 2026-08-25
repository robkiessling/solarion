import React from 'react';
import {connect} from "react-redux";
import {INFESTED_GLYPH, STATUSES, TERRAINS} from "../lib/planet_map";
import {PLANET_COLORS} from "../lib/planet_render";
import {POI_STATUS} from "../lib/expeditions";

/**
 * Key to the ground glyphs on the globe. Terrain drives movement cost and battery drain, so it stays spelled
 * out; it lives pinned at the foot of the right column (reference material, out of the map's frame) next to
 * the Expedition panel's live terrain readout, sharing its color vocabulary.
 */
class TerrainLegend extends React.Component {
    render() {
        const entries = [TERRAINS.home, STATUSES.unknown, TERRAINS.flatland, TERRAINS.mountain, TERRAINS.water,
            TERRAINS.developed];
        if (this.props.anyPoiVisible) {
            entries.push({ key: 'infested', display: INFESTED_GLYPH, label: 'Infested' });
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
        // The infested entry only appears once relevant (any POI discovered), same rule as the map's marker key
        anyPoiVisible: Object.values(state.planet.pois || {}).some(poi => poi.status !== POI_STATUS.hidden)
    };
};

export default connect(mapStateToProps, {})(TerrainLegend);
