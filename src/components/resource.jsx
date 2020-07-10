import React from 'react';
// import {connect} from "react-redux";
// import {getResource} from "../redux/modules/resources";
import {round} from "../lib/helpers";

export default class Resource extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        let rate = null;
        if (this.props.rate > 0) {
            rate = <span className="text-green"> (+{this.props.rate}/s)</span>
        }
        else if (this.props.rate < 0) {
            rate = <span className="text-red"> ({this.props.rate}/s)</span>
        }

        return (
            <div className="resource">
                {this.props.resource.name}: {round(this.props.resource.amount)}
                {rate}
            </div>
        );
    }
}

// const mapStateToProps = (state, ownProps) => {
//     const resource = getResource(state.resources, ownProps.type);
//
//     return {
//         resource: resource
//     }
// };
//
// export default connect(
//     mapStateToProps,
//     {}
// )(Resource);
//
