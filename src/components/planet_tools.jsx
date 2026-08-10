import React from 'react';
import {connect} from "react-redux";
import Expedition from "./expedition";
import 'overlayscrollbars/styles/overlayscrollbars.css';
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";

/**
 * Right column of the Planet tab: the expedition operations panel. Passive planet status (exploration,
 * replication) lives in the left column instead (see planet_panels.jsx).
 */
class PlanetTools extends React.Component {
    shouldComponentUpdate(nextProps, nextState) {
        // Checking both this props and next props to ensure we update on visibility changes
        return this.props.visible || nextProps.visible;
    }

    render() {
        return (
            <div className={`planet-tools ${this.props.visible ? '' : 'hidden'}`}>
                <OverlayScrollbarsComponent className="planet-tools-scroll" defer>
                    <Expedition />
                </OverlayScrollbarsComponent>
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
)(PlanetTools);
