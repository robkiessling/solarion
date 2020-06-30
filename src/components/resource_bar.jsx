import React from 'react';
import { connect } from 'react-redux';

import gameClock from "../singletons/game_clock"
import resourceManager from "../singletons/resource_manager"

class ResourceBar extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className="resource-bar">
                <button onClick={() => resourceManager.consume('minerals', 20)} disabled={!resourceManager.hasQuantity('minerals', 20)}>click!</button>
                <div>
                    Minerals: { resourceManager.quantity('minerals') }
                </div>
                <div>
                    Time: { Math.floor(gameClock.total / 1000.0) }
                </div>
                {/*<div>*/}
                {/*    /!*Real: { (new Date()).toLocaleString() }*!/*/}
                {/*    Real: { Date.now() }*/}
                {/*</div>*/}
            </div>
        );
    }
}

// Updates to these fields will trigger re-renders
const mapStateToProps = state => {
    return {
        clock: state.clock,
        resources: state.resources
    }
};

export default connect(
    mapStateToProps,
    null
)(ResourceBar);