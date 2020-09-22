import React from 'react';
import {connect} from "react-redux";
import {
    getStatistic, getNumRunning, setRunning
} from "../../redux/modules/structures";
import { getStructure, getBuildCost } from "../../redux/modules/structures";
import {
    canBuildStructure,
    buildStructure,
    researchUpgrade,
    canRunStructure
} from "../../redux/reducer";

import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import ResourceAmounts from "../ui/resource_amounts";
import Animation from "../animation";
import ReactTooltip from "react-tooltip";

class Structure extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        let sliderMarks = {};
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

        const buildTipId = `build-${this.props.structure.id}`;
        const imageKey = this.props.structure.runnable ? (this.props.isRunning ? 'running' : 'idle') : 'idle';

        return (
            <div className="structure">
                <div className="left-side">
                    <Animation id={this.props.structure.id} imageKey={imageKey} />
                </div>
                <div className="right-side">
                    <div className="header">
                        <div className="name">{this.props.structure.name}</div>
                    </div>
                    <div className="description">
                        {this.props.structure.description}
                    </div>
                    <div className="body">
                        <div className="build-area">
                            <div className="quantity">Quantity: {this.props.numBuilt}</div>
                            <button onClick={() => this.props.buildStructure(this.props.type, 1)}
                                    disabled={!this.props.canBuild} className="has-tip">
                                <span data-tip data-for={buildTipId}>Build</span>
                            </button>
                            <ReactTooltip id={buildTipId} place="right" effect="solid" className="game-tooltip">
                                Cost: <ResourceAmounts amounts={this.props.cost} />
                            </ReactTooltip>
                        </div>
                        <div className="details-area">
                            {
                                this.props.structure.runnable &&
                                <Slider className={'range-slider' + (this.props.numBuilt !== 1 ? ' tall' : '')}
                                        min={0} max={this.props.numBuilt} marks={sliderMarks}
                                        onChange={(value) => this.props.setRunning(this.props.type, value)}
                                        disabled={!this.props.canRun}
                                        value={this.props.numRunning}
                                />
                            }
                            {
                                Object.keys(this.props.production).length > 0 &&
                                <div>
                                    Producing: <ResourceAmounts amounts={this.props.production} asRates={true} />
                                </div>
                            }
                            {
                                Object.keys(this.props.consumption).length > 0 &&
                                <div>
                                    Consuming: <ResourceAmounts amounts={this.props.consumption} asRates={true} invert={true} />
                                </div>
                            }
                            {
                                Object.keys(this.props.capacity).length > 0 &&
                                <div>
                                    Capacity: <ResourceAmounts amounts={this.props.capacity} />
                                </div>
                            }
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const mapStateToProps = (state, ownProps) => {
    const structure = getStructure(state.structures, ownProps.type);

    return {
        structure: structure,
        canBuild: canBuildStructure(state, structure),
        cost: getBuildCost(structure),
        production: getStatistic(structure, 'produces'),
        consumption: getStatistic(structure, 'consumes'),
        capacity: getStatistic(structure, 'capacity'),

        isRunning: getNumRunning(structure) > 0,
        numBuilt: structure.count.total,
        canRun: canRunStructure(state, structure),
        numRunning: getNumRunning(structure)
    }
};

export default connect(
    mapStateToProps,
    { buildStructure, setRunning, researchUpgrade }
)(Structure);

