import React from 'react';
import Structure from "./structure";
import {connect} from "react-redux";
import {getStructure} from "../../redux/modules/structures";


export class ProbeFactory extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <Structure type="probeFactory">
                {
                    this.props.isBuilt && this.props.mirrorEnabled &&
                    <div className={`d-flex space-between`} style={{'marginTop': '1rem'}}>
                        <div>Mirror Target:</div>
                        <div>{this.props.mirrorTarget}</div>
                    </div>
                }
                {
                    this.props.isBuilt && this.props.mirrorEnabled &&
                    <div className={`d-flex space-between`} style={{'marginBottom': '1rem'}}>
                        <div>Mirrored Amount:</div>
                        <div>{Math.floor(this.props.mirrorAmount * 100)}%</div>
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
        mirrorEnabled: state.star.mirrorEnabled,
        mirrorTarget: state.star.mirrorTarget,
        mirrorAmount: state.star.mirrorAmount,
    }
}

export default connect(
    mapStateToProps,
    {}
)(ProbeFactory);

