import React from 'react';
import {connect} from "react-redux";
import { getStatistic, getRunningRate } from "../../redux/modules/structures";
import { getStructure } from "../../redux/modules/structures";
import { buildStructure, researchUpgrade } from "../../redux/reducer";

import 'rc-slider/assets/index.css';
import ResourceAmounts from "../ui/resource_amounts";
import Animation from "../animation";
import RunSlider from "./run_slider";
import BuildButton from "./build_button";
import {daylightPercent} from "../../redux/modules/clock";

class Structure extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        const imageKey = this.props.structure.runnable ? (this.props.isRunning ? 'running' : 'idle') : 'idle';

        return (
            <div className="structure">
                <div className="left-side">
                    <Animation id={this.props.structure.id} imageKey={imageKey} />
                    <BuildButton structure={this.props.structure}/>
                </div>
                <div className="right-side">
                    <div className="header">
                        <span>{this.props.structure.name}</span>
                    </div>
                    {/*<div className="description">*/}
                    {/*    {this.props.structure.description}*/}
                    {/*</div>*/}
                    <div className="body">
                        <div className="details-area">
                            { this.props.structure.runnable && <RunSlider structure={this.props.structure}/> }

                            {
                                Object.keys(this.props.production).length > 0 &&
                                <div>
                                    Producing: <ResourceAmounts amounts={this.props.production} asRates={true} />
                                    { this.props.productionSuffix }
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

    let productionSuffix = null;
    if (structure.id === 'solarPanel') {
        // todo this logic should be elsewhere...
        productionSuffix = ` (${daylightPercent(state.clock) * 100}% daylight)`;
    }

    return {
        structure: structure,
        production: getStatistic(structure, 'produces'),
        consumption: getStatistic(structure, 'consumes'),
        capacity: getStatistic(structure, 'capacity'),

        productionSuffix: productionSuffix,

        isRunning: getRunningRate(structure) > 0
    }
};

export default connect(
    mapStateToProps,
    { buildStructure, researchUpgrade }
)(Structure);

