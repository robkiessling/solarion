import React from 'react';
import {connect} from "react-redux";

class Events extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className="replication-status">
                <div className="component-header">Events</div>

                <span className="key-value-pair">
                    <span>[Not implemented]</span>
                </span>
            </div>
        );
    }
}

const mapStateToProps = (state, ownProps) => {
    return {
    };
};

export default connect(
    mapStateToProps,
    {}
)(Events);

