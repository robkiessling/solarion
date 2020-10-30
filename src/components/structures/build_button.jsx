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
            {/*<span className="build-count">{this.props.numBuilt}</span>*/}
            <button onClick={() => this.props.buildStructure(this.props.structure.id, 1)}
                    disabled={!this.props.canBuild} className="has-tip">
                <span data-tip data-for={tipId}>Build</span>
            </button>
            <ReactTooltip id={tipId} place="right" effect="solid" className="game-tooltip">
                <p>
                    <b>Build {this.props.name}</b>
                </p>
                Cost: <ResourceAmounts amounts={this.props.cost} />
            </ReactTooltip>
        </div>
    }
}


const mapStateToProps = (state, ownProps) => {
    const structure = ownProps.structure;

    return {
        name: structure.name,
        numBuilt: structure.count.total,
        canBuild: canBuildStructure(state, structure),
        cost: getBuildCost(structure)
    }
}

export default connect(
    mapStateToProps,
    { buildStructure }
)(BuildButton);