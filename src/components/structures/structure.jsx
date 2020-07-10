import React from 'react';
import {connect} from "react-redux";
import {build, getProduction, getConsumption, toggleRunning} from "../../redux/modules/structures";
import { getStructure, getBuildCost } from "../../redux/modules/structures";
import {toString} from "../../redux/modules/resources";
import {canBuildStructure} from "../../redux/reducer";
import ReactSwitch from "react-switch";

class Structure extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className="structure">
                <div className="header">
                    <div className="name">{this.props.structure.name}</div>
                    <div className="count">{this.props.buildable && this.props.structure.count}</div>
                </div>
                <div className="buttons">
                    {
                        this.props.structure.buildable &&
                        <button onClick={() => this.props.build(this.props.type, 1)} disabled={!this.props.canBuild}>
                            Build {`(${toString(this.props.cost)})`}
                        </button>
                    }
                    {
                        this.props.structure.runnable &&
                            <label className="on-off-switch">
                                <ReactSwitch onChange={(checked) => this.props.toggleRunning(this.props.type, checked)}
                                             checked={this.props.structure.running === this.props.structure.count} />
                            </label>
                    }
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
    const structure = getStructure(state.structures, ownProps.type);

    return {
        structure: structure,
        canBuild: canBuildStructure(state, structure),
        cost: getBuildCost(structure),
        production: getProduction(structure),
        consumption: getConsumption(structure)
    }
};

export default connect(
    mapStateToProps,
    { build, toggleRunning }
)(Structure);

