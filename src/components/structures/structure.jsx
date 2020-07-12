import React from 'react';
import {connect} from "react-redux";
import {getProduction, getConsumption, toggleRunning, getNumRunning} from "../../redux/modules/structures";
import { getStructure, getBuildCost } from "../../redux/modules/structures";
import {toString} from "../../redux/modules/resources";
import {canBuildStructure, buildStructure} from "../../redux/reducer";
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
                    <div className="count">{this.props.structure.buildable && this.props.numRunning}</div>
                </div>
                <div className="buttons">
                    {
                        this.props.structure.buildable &&
                        <button onClick={() => this.props.buildStructure(this.props.type, 1)} disabled={!this.props.canBuild}>
                            Build {`(${toString(this.props.cost)})`}
                        </button>
                    }
                    {
                        this.props.structure.runnable &&
                            <label className="on-off-switch">
                                <ReactSwitch onChange={(checked) => this.props.toggleRunning(this.props.type, checked)}
                                             checked={this.props.isRunning} />
                            </label>
                    }
                    {this.props.buttons}
                </div>
                <div>
                    Producing: {toString(this.props.production)}
                </div>
                <div>
                    Consuming: {toString(this.props.consumption, this.props.structure.consumeString)}
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
        consumption: getConsumption(structure),
        isRunning: structure.count.running === structure.count.total,
        numRunning: getNumRunning(structure)
    }
};

export default connect(
    mapStateToProps,
    { buildStructure, toggleRunning }
)(Structure);

