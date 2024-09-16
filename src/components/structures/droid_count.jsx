import React from 'react';
import {connect} from "react-redux";
import {assignDroid, canAssignDroid, canRemoveDroid, removeDroid} from "../../redux/reducer";
import Tooltip from "../ui/tooltip";
import {droidPerformanceBoost} from "../../database/structures";

class DroidCount extends React.Component {

    render() {
        const tipIdAssign = `assign-droids-${this.props.tipId}`;
        const tipIdRemove = `remove-droids-${this.props.tipId}`;

        return <div className="droid-count">
            <div>Droids:</div>
            <div>
                <span className="num-droids">{this.props.droidData.numDroidsAssigned}</span>
                <span className={'icon-vintage-robot'}></span>
                <button onClick={() => this.props.assignDroid(this.props.droidData, this.props.targetId)}
                        disabled={!this.props.canAssign} className="has-tip"
                        data-tip data-for={tipIdAssign}>
                    <span>+</span>
                </button>
                <Tooltip id={tipIdAssign} place="bottom">
                    <p><span className="tooltip-header">Assign Droid</span></p>
                    <p>Each droid boosts productivity by {_.round(this.props.boost * 100)}%.</p>
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
        boost: droidPerformanceBoost(state)
    }
}

export default connect(
    mapStateToProps,
    { assignDroid, removeDroid }
)(DroidCount);