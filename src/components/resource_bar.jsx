import React from 'react';
import { connect } from 'react-redux';

import { consume, getQuantity } from "../redux/modules/resources"

class ResourceBar extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className="resource-bar">
                <button onClick={() => this.props.consume('minerals', 20)}>test!</button>
                <div>
                    Minerals: { this.props.minerals }
                </div>
                <div>
                    Time: { Math.floor(this.props.elapsedTime / 1000.0) }
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
        elapsedTime: state.clock.elapsedTime,
        resources: state.resources,
        minerals: getQuantity(state, 'minerals')
    }
};

export default connect(
    mapStateToProps,
    { consume }
)(ResourceBar);