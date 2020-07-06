import React from 'react';
import {connect} from "react-redux";
import {build, getProduction, getConsumption} from "../../redux/modules/structures";
import { getStructure, getBuildCost, canBuild } from "../../redux/modules/structures";
import {toString} from "../../redux/modules/resources";

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
                        Build {`(${toString(this.props.cost)})`}
                    </button>
                    {this.props.buttons}
                </div>
                <div>
                    Produces: {toString(this.props.production)}
                </div>
                <div>
                    Consumes: {toString(this.props.consumption)}
                </div>
            </div>
        );
    }
}

const mapStateToProps = (state, ownProps) => {
    const structure = getStructure(state, ownProps.type);

    return {
        structure: structure,
        canBuild: canBuild(state, structure),
        cost: getBuildCost(structure),
        production: getProduction(structure),
        consumption: getConsumption(structure)
    }
};

export default connect(
    mapStateToProps,
    { build }
)(Structure);

