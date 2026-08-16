import React from 'react';
import {connect} from "react-redux";
import {buildVista, headingName} from "../lib/vista";
import {PLANET_COLORS} from "../lib/planet_render";

// Off while other sense-of-place ideas are tried: as a live driving panel the vista changed too much per
// turn (facing isn't a concept the driver otherwise has) to be worth a glance. buildVista is kept for a
// possible second life as a scene picture at the moments the player stops (encounter popup, contact beat).
const SHOW_VISTA = false;

/**
 * The view out the front window: an ASCII skyline of the ground ahead of the deployed squad, in the
 * direction it last pushed (see lib/vista.js). Sits at the top of the Expedition panel while a team is out.
 */
class Vista extends React.Component {
    render() {
        const { map, pois, squad } = this.props;
        if (!SHOW_VISTA || !squad || map.length === 0) return null;

        const rows = buildVista(map, pois, squad);
        return (
            <div className="vista">
                <pre className="vista-window">
                    {rows.map((row, r) =>
                        <div key={r} className="vista-row">
                            {row.map((segment, i) =>
                                <span key={i} style={{ color: PLANET_COLORS[segment.colorKey] || '#ffffff' }}>
                                    {segment.text}
                                </span>)}
                        </div>)}
                </pre>
                <span className="vista-caption">Looking {headingName(squad.facing || [0, -1])}</span>
            </div>
        );
    }
}

const mapStateToProps = (state) => ({
    map: state.planet.map,
    pois: state.planet.pois,
    squad: state.planet.squad
});

export default connect(mapStateToProps, {})(Vista);
