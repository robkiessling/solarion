import React from 'react';
import { connect } from 'react-redux';

import Resource from "./resource"

class ResourceBar extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className="resource-bar">
                <div>
                    Time: { Math.floor(this.props.elapsedTime / 1000.0) }
                </div>
                <br/>
                {
                    this.props.visibleIds.map((id) => {
                        return <Resource type={id} key={id} />
                    })
                }
            </div>
        );
    }
}

// Updates to these fields will trigger re-renders
const mapStateToProps = state => {
    return {
        elapsedTime: state.clock.elapsedTime,
        visibleIds: state.resources.visibleIds
    }
};

export default connect(
    mapStateToProps,
    {}
)(ResourceBar);