import React from 'react';
import {connect} from "react-redux";
import {getResource} from "../redux/modules/resources";

class Resource extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className="resource">
                {this.props.resource.name}: {Math.floor(this.props.resource.amount)}
            </div>
        );
    }
}

const mapStateToProps = (state, ownProps) => {
    const resource = getResource(state.resources, ownProps.type);

    return {
        resource: resource,
        // production: getProduction(structure)
    }
};

export default connect(
    mapStateToProps,
    {}
)(Resource);

