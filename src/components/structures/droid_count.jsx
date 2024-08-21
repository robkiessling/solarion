import React from 'react';
import {connect} from "react-redux";
import {assignDroid, canAssignDroid, canRemoveDroid, removeDroid} from "../../redux/reducer";
import Tooltip from "../ui/tooltip";
import {droidPerformanceBoost} from "../../database/structures";

class DroidCount extends React.Component {

    render() {
        const tipIdAssign = `assign-droids-${this.props.structure.id}`;
        const tipIdRemove = `remove-droids-${this.props.structure.id}`;

        return <div className="droids-area">
            Droids:<span className="num-droids">{this.props.numDroids}</span>
            <button onClick={() => this.props.assignDroid(this.props.structure.id)}
                    disabled={!this.props.canAssign} className="has-tip"
                    data-tip data-for={tipIdAssign}>
                <span>+</span>
            </button>
            <Tooltip id={tipIdAssign} place="top">
                <p><span className="tooltip-header">Assign Droid</span></p>
                {/*<p>Each droid boosts productivity by {_.round(this.props.boost * 100)}%.</p>*/}
            </Tooltip>
            <button onClick={() => this.props.removeDroid(this.props.structure.id)}
                    disabled={!this.props.canRemove} className="has-tip"
                    data-tip data-for={tipIdRemove}>
                <span>-</span>
            </button>
            <Tooltip id={tipIdRemove} place="top">
                <p><span className="tooltip-header">Remove Droid</span></p>
                {/*<p>Return the droid to the factory.</p>*/}
            </Tooltip>
        </div>
    }
}


const mapStateToProps = (state, ownProps) => {
    const structure = ownProps.structure;

    return {
        numDroids: structure.numDroids,
        canAssign: canAssignDroid(state, structure),
        canRemove: canRemoveDroid(state, structure),
        boost: droidPerformanceBoost(state)
    }
}

export default connect(
    mapStateToProps,
    { assignDroid, removeDroid }
)(DroidCount);