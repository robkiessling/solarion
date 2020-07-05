import React from 'react';
import {connect} from "react-redux";
import {build, getProduction} from "../redux/modules/structures";
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
                <div>
                    Produces: {this.props.production}/s
                </div>
            </div>
        );
    }
}

const mapStateToProps = (state, ownProps) => {
    const structure = getStructure(state, ownProps.type);

    return {
        resources: state.resources,
        structure: structure,
        canBuild: canBuild(state, structure),
        cost: getBuildCost(structure),
        production: getProduction(structure)
    }
};

export default connect(
    mapStateToProps,
    { build }
)(Structure);

