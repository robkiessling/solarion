import React from 'react';
import {connect} from "react-redux";
import {
    assignAllDroids,
    assignDroid,
    canAssignDroid,
    canRemoveDroid,
    removeAllDroids,
    removeDroid
} from "../../redux/reducer";
import Tooltip from "../ui/tooltip";
import {getLifetimeQuantity, getResource} from "../../redux/modules/resources";

class DroidCount extends React.Component {

    render() {
        const tipIdAssign = `assign-droids-${this.props.tipId}`;
        const tipIdRemove = `remove-droids-${this.props.tipId}`;
        const tipIdAssignAll = `assign-all-droids-${this.props.tipId}`;
        const tipIdRemoveAll = `remove-all-droids-${this.props.tipId}`;

        return <div className="droid-count">
            <div>Droids:</div>
            <div>
                <span className="num-droids">{this.props.droidData.numDroidsAssigned}</span>
                <span className={'icon-vintage-robot'}></span>
                {
                    this.props.showBulkButtons &&
                    <button onClick={() => this.props.assignAllDroids(this.props.droidData, this.props.targetId)}
                            disabled={!this.props.canAssign} className="has-tip"
                            data-tip data-for={tipIdAssignAll}>
                        <span>++</span>
                    </button>
                }
                {
                    this.props.showBulkButtons &&
                    <Tooltip id={tipIdAssignAll} place="bottom">
                        <p><span className="tooltip-header">Assign All Available Droids</span></p>
                        <p>{this.props.assignTooltip}</p>
                    </Tooltip>
                }
                <button onClick={() => this.props.assignDroid(this.props.droidData, this.props.targetId)}
                        disabled={!this.props.canAssign} className="has-tip"
                        data-tip data-for={tipIdAssign}>
                    <span>+</span>
                </button>
                <Tooltip id={tipIdAssign} place="bottom">
                    <p><span className="tooltip-header">Assign Droid</span></p>
                    <p>{this.props.assignTooltip}</p>
                </Tooltip>
                <button onClick={() => this.props.removeDroid(this.props.droidData, this.props.targetId)}
                        disabled={!this.props.canRemove} className="has-tip"
                        data-tip data-for={tipIdRemove}>
                    <span>-</span>
                </button>
                <Tooltip id={tipIdRemove} place="bottom">
                    <p><span className="tooltip-header">Remove Droid</span></p>
                    <p>Return the droid to the factory.</p>
                </Tooltip>
                {
                    this.props.showBulkButtons &&
                    <button onClick={() => this.props.removeAllDroids(this.props.droidData, this.props.targetId)}
                            disabled={!this.props.canRemove} className="has-tip"
                            data-tip data-for={tipIdRemoveAll}>
                        <span>--</span>
                    </button>
                }
                {
                    this.props.showBulkButtons &&
                    <Tooltip id={tipIdRemoveAll} place="bottom">
                        <p><span className="tooltip-header">Remove All Droids</span></p>
                        <p>Return all droids from here to the factory.</p>
                    </Tooltip>
                }
            </div>
        </div>
    }
}


const mapStateToProps = (state, ownProps) => {
    // Some <DroidCount>s require a targetId to specify where the assign/remove actions should modify (e.g. structures)
    // Some do not need a targetId (e.g. planet)
    const targetId = ownProps.targetId;

    return {
        targetId: ownProps.targetId,
        tipId: `${ownProps.droidData.droidAssignmentType}-${targetId}`,
        droidData: ownProps.droidData,
        canAssign: canAssignDroid(state, ownProps.droidData),
        canRemove: canRemoveDroid(state, ownProps.droidData),
        assignTooltip: ownProps.assignTooltip,
        showBulkButtons: getLifetimeQuantity(getResource(state.resources, 'standardDroids')) >= 10
    }
}

export default connect(
    mapStateToProps,
    { assignDroid, removeDroid, assignAllDroids, removeAllDroids }
)(DroidCount);