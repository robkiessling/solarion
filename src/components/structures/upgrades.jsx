import React from "react";
import {connect} from "react-redux";
import {getStructureUpgradeIds} from "../../redux/reducer";
import Upgrade from "./upgrade";
import DecisionRow from "./decision_row";
import {pendingForStructure} from "../../redux/modules/decisions";
import 'overlayscrollbars/styles/overlayscrollbars.css';
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";

class Upgrades extends React.Component {
    constructor(props) {
        super(props);
    }
    // Pending decision requests (the machine asking) sit above the upgrades (the machine offering)
    renderRows() {
        return [
            ...this.props.decisions.map(entry => <DecisionRow key={`decision-${entry.id}`} id={entry.id} seen={entry.seen}/>),
            ...this.props.upgradeIds.map(id => <Upgrade key={id} id={id} tooltipProps={this.props.tooltipProps}/>)
        ];
    }

    render() {
        if (this.props.scrollable) {
            return <OverlayScrollbarsComponent className="upgrades-area scrollable" defer>
                {this.renderRows()}
            </OverlayScrollbarsComponent>
        }
        else {
            return <div className="upgrades-area">
                {this.renderRows()}
            </div>
        }
    }
}

const mapStateToProps = (state, ownProps) => {
    const structure = ownProps.structure;

    return {
        upgradeIds: getStructureUpgradeIds(state, structure),
        decisions: pendingForStructure(state.decisions, structure.id)
    }
};

export default connect(
    mapStateToProps,
    null
)(Upgrades);