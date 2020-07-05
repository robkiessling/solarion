import React from 'react';
import {connect} from "react-redux";
import {build} from "../redux/modules/structures";
import { getStructure, getBuildCost, canBuild } from "../redux/modules/structures";

class Structure extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className="structure">
                <div className="header">
                    <div className="name">{this.props.structure.name}</div>
                    <div className="count">{this.props.structure.count}</div>
                </div>
                <div className="buttons">
                    <button onClick={() => this.props.build(this.props.type, 1)}
                            disabled={!this.props.canBuild}>
                        Build {this.props.structure.name}{` (-${this.props.cost})`}
                    </button>
                    {this.props.buttons}
                </div>
            </div>
        );
    }
}

const mapStateToProps = (state, ownProps) => {
    return {
        resources: state.resources,
        structure: getStructure(state, ownProps.type),
        canBuild: canBuild(state, ownProps.type),
        cost: getBuildCost(state, ownProps.type)
    }
};

export default connect(
    mapStateToProps,
    { build }
)(Structure);

