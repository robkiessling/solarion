import React from 'react';
import {connect} from "react-redux";
import ReactTooltip from "react-tooltip";
import ResourceAmounts from "../ui/resource_amounts";
import {buildStructure, canBuildStructure} from "../../redux/reducer";
import {getBuildCost} from "../../redux/modules/structures";

class BuildButton extends React.Component {

    render() {
        const tipId = `build-${this.props.structure.id}`;

        return <div className="build-area">
            <span>{this.props.numBuilt}</span>
            <button onClick={() => this.props.buildStructure(this.props.structure.id, 1)}
                    disabled={!this.props.canBuild} className="has-tip">
                <span data-tip data-for={tipId}>Build</span>
            </button>
            <ReactTooltip id={tipId} place="right" effect="solid" className="game-tooltip">
                Cost: <ResourceAmounts amounts={this.props.cost} />
            </ReactTooltip>
        </div>
    }
}


const mapStateToProps = (state, ownProps) => {
    const structure = ownProps.structure;

    return {
        numBuilt: structure.count.total,
        canBuild: canBuildStructure(state, structure),
        cost: getBuildCost(structure)
    }
}

export default connect(
    mapStateToProps,
    { buildStructure }
)(BuildButton);