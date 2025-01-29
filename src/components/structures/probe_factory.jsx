import React from 'react';
import Structure from "./structure";
import {connect} from "react-redux";
import {getStructure} from "../../redux/modules/structures";
import {energyBeamStrengthPct} from "../../redux/reducer";
import Dropdown from "../ui/dropdown";
import {aimMirrors, TARGET_LABELS} from "../../redux/modules/star";


class ProbeFactory extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        const targets = Object.entries(TARGET_LABELS).map(
            ([k, v]) => ({ text: v, value: k })
        )

        let mirrorAmountColor = '#fff';
        if (this.props.mirrorAmount >= 0.02) {
            mirrorAmountColor = '#ff9900';
        }
        if (this.props.mirrorAmount >= 0.2) {
            mirrorAmountColor = '#ff0000';
        }

        return (
            <Structure type="probeFactory">
                {
                    this.props.isBuilt && this.props.mirrorsOnline &&
                    <div className={`d-flex space-between`} style={{'marginTop': '1rem'}}>
                        <div>Mirror Target:</div>
                        <div>
                            <Dropdown options={targets} selected={this.props.mirrorTarget}
                                      onChange={value => this.props.aimMirrors(value)} />
                        </div>
                    </div>
                }
                {
                    this.props.isBuilt && this.props.mirrorsOnline &&
                    <div className={`d-flex space-between`}>
                        <div>Mirrored Amount:</div>
                        <div style={{color: mirrorAmountColor}}>{Math.floor(this.props.mirrorAmount * 100)}%</div>
                    </div>
                }
            </Structure>
        );
    }
}

const mapStateToProps = (state, ownProps) => {
    const structure = getStructure(state.structures, 'probeFactory');

    return {
        isBuilt: structure.count.total > 0,
        mirrorsOnline: state.star.mirrorsOnline,
        mirrorTarget: state.star.mirrorTarget,
        mirrorAmount: energyBeamStrengthPct(state),
    }
}

export default connect(
    mapStateToProps,
    {aimMirrors}
)(ProbeFactory);

