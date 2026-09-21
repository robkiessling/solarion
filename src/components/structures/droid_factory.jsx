import React from 'react';
import {connect} from "react-redux";
import Structure from "./structure";
import {getStructure} from "../../redux/modules/structures";
import {chassisIndexRevealed, chassisNeedsAttention, openPanel} from "../../redux/modules/panels";
import {CHASSIS_PANEL} from "../../database/chassis";

// The droid factory card: the generic structure card plus the opener for its special panel,
// the schematic index (chassis design corpus — components/panels/schematic_index.jsx).
// The opener waits for the first fight to end (see chassisIndexRevealed).
// The opener glows when the index deserves a visit: a newly arrived row, or an unsigned
// row that's affordable right now (see chassisNeedsAttention).
class DroidFactory extends React.Component {
    render() {
        return (
            <Structure type="droidFactory">
                {this.props.isBuilt && this.props.indexRevealed &&
                    <button className={`panel-opener${this.props.attention ? ' attention' : ''}`}
                            onClick={() => this.props.openPanel(CHASSIS_PANEL.id)}>
                        ▤ SCHEMATIC INDEX
                    </button>}
            </Structure>
        );
    }
}

const mapStateToProps = (state) => {
    const structure = getStructure(state.structures, 'droidFactory');
    return {
        isBuilt: !!structure && structure.count.total > 0,
        indexRevealed: chassisIndexRevealed(state),
        attention: chassisNeedsAttention(state),
    };
};

export default connect(
    mapStateToProps,
    { openPanel }
)(DroidFactory);
