import React from 'react';
import {connect} from "react-redux";
import ResourceAmounts from "../ui/resource_amounts";
import {buildStructure, canBuildStructure} from "../../redux/reducer";
import {getBuildCost} from "../../redux/modules/structures";
import Tooltip from "../ui/tooltip";
import {highlightCosts} from "../../redux/modules/resources";

class BuildButton extends React.Component {

    render() {
        const tipId = `build-${this.props.structure.id}`;

        return <div className="build-button">
            {/*<span className="build-count">{this.props.numBuilt}</span>*/}
            <button onClick={() => this.props.buildStructure(this.props.structure.id, 1)}
                    disabled={!this.props.canBuild} className="action-button has-tip">
                <span data-tip data-for={tipId}>
                    <span className={'icon-flat-hammer'}></span>
                    Build
                </span>
            </button>
            <Tooltip id={tipId}>
                <p>
                    <span className="tooltip-header">Build {this.props.name}</span>
                </p>
                <p>
                    Cost: <ResourceAmounts amounts={this.props.cost} />
                </p>
            </Tooltip>
        </div>
    }
}


const mapStateToProps = (state, ownProps) => {
    const structure = ownProps.structure;

    return {
        name: structure.name,
        numBuilt: structure.count.total,
        canBuild: canBuildStructure(state, structure),
        cost: highlightCosts(state.resources, getBuildCost(structure)),
    }
}

export default connect(
    mapStateToProps,
    { buildStructure }
)(BuildButton);