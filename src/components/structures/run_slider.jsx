import React from "react";
import Slider from "rc-slider";
import {getNumRunning, setRunning} from "../../redux/modules/structures";
import {canRunStructure} from "../../redux/reducer";
import {connect} from "react-redux";

class RunSlider extends React.Component {
    constructor(props) {
        super(props);
    }
    render() {
        let sliderMarks;
        if (this.props.numBuilt === 1) {
            sliderMarks = {
                0: 'Off',
                1: 'On'
            }
        }
        else {
            const maxTicks = 5;
            const tickDistance = Math.ceil(this.props.numBuilt / maxTicks);
            sliderMarks = {
                0: `0 Off`,
                [this.props.numBuilt]: `${this.props.numBuilt} On`
            };
            for (let i = tickDistance; i < this.props.numBuilt; i += tickDistance) {
                sliderMarks[i] = i;
            }
        }

        return <Slider className={'range-slider' + (this.props.numBuilt !== 1 ? ' tall' : '')}
                       min={0} max={this.props.numBuilt} marks={sliderMarks}
                       onChange={(value) => this.props.setRunning(this.props.structure.id, value)}
                       disabled={!this.props.canRun}
                       value={this.props.numRunning}/>;
    }
}

const mapStateToProps = (state, ownProps) => {
    const structure = ownProps.structure;

    return {
        numBuilt: structure.count.total,
        canRun: canRunStructure(state, structure),
        numRunning: getNumRunning(structure)
    }
};

export default connect(
    mapStateToProps,
    { setRunning }
)(RunSlider);

