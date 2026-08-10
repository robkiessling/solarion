import React from 'react';
import {connect} from "react-redux";
import Exploration from "./exploration";
import Replication from "./replication";

/**
 * Left-column status panels for the Planet tab; fills the slot where the Command Center sits on the Base tab.
 * Passive planet status lives here; the active Expeditions panel owns the right column (see planet_tools.jsx).
 */
class PlanetPanels extends React.Component {
    shouldComponentUpdate(nextProps, nextState) {
        // Checking both this props and next props to ensure we update on visibility changes
        return this.props.visible || nextProps.visible;
    }

    render() {
        return (
            <div className={`planet-panels ${this.props.visible ? '' : 'hidden'}`}>
                <Exploration/>
                <Replication/>
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
