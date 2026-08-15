import React from 'react';
import {connect} from "react-redux";
import PlanetCard from "./planet_card";

/**
 * Left-column slot for the Planet tab; fills the space where the Command Center sits on the Base tab.
 * Passive planet status lives here (one card); the active Expedition panel owns the right column
 * (see planet_tools.jsx) and the camera controls ride under the globe itself (camera_strip.jsx).
 */
class PlanetPanels extends React.Component {
    shouldComponentUpdate(nextProps, nextState) {
        // Checking both this props and next props to ensure we update on visibility changes
        return this.props.visible || nextProps.visible;
    }

    render() {
        return (
            <div className={`planet-panels ${this.props.visible ? '' : 'hidden'}`}>
                <PlanetCard/>
            </div>
        );
    }
}

const mapStateToProps = (state, ownProps) => {
    return {
        visible: state.game.currentNavTab === 'planet'
    };
};

export default connect(
    mapStateToProps,
    {}
)(PlanetPanels);
