import React from "react";
import Slider from "rc-slider";
import {canRunStructure, getRunningRate, setRunningRate} from "../../redux/modules/structures";
import {connect} from "react-redux";

class RunSlider extends React.Component {
    constructor(props) {
        super(props);
    }
    render() {
        const sliderMarks = {
            0: 'Off',
            0.25: '25%',
            0.5: '50%',
            0.75: '75%',
            1: '100%'
        }

        return <Slider className={'range-slider'}
                       disabled={!this.props.canRun}
                       min={0} max={1} step={0.01} marks={sliderMarks}
                       onChange={(value) => this.props.setRunningRate(this.props.structure.id, value)}
                       value={this.props.runningRate}/>;
    }
}

const mapStateToProps = (state, ownProps) => {
    const structure = ownProps.structure;

    return {
        numBuilt: structure.count.total,
        runningRate: getRunningRate(structure),
        canRun: true//canRunStructure(state, structure) // TODO Remove canRun code?
    }
};

export default connect(
    mapStateToProps,
    { setRunningRate }
)(RunSlider);

