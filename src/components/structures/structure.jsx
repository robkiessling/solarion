import React from 'react';
import {connect} from "react-redux";
import {
    getStatistic,
    getRunningRate,
    getImage,
    getStatusMessage,
    hasInsufficientResources
} from "../../redux/modules/structures";
import { getStructure } from "../../redux/modules/structures";
import { buildStructure, researchUpgrade } from "../../redux/reducer";

import 'rc-slider/assets/index.css';
import ResourceAmounts from "../ui/resource_amounts";
import Animation from "../animation";
import RunSlider from "./run_slider";
import BuildButton from "./build_button";
import {daylightPercent} from "../../redux/modules/clock";
import Upgrades from "./upgrades";

class Structure extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className="structure">
                <div className="left-side">
                    <span className="build-count">{this.props.numBuilt}</span>
                    <Animation id={this.props.structure.id} imageKey={this.props.imageKey} />
                    <BuildButton structure={this.props.structure}/>
                </div>
                <div className="right-side">
                    <div className="header">
                        <span className="structure-name">{this.props.structure.name}</span>
                    </div>
                    {/*<div className="description">*/}
                    {/*    {this.props.structure.description}*/}
                    {/*</div>*/}
                    <div className="body">
                        <div className="details-area">
                            { this.props.structure.runnable && <RunSlider structure={this.props.structure}/> }

                            {
                                Object.keys(this.props.production).length > 0 &&
                                <div className={this.props.hasInsufficientResources ? 'text-grey' : ''}>
                                    Producing: <ResourceAmounts amounts={this.props.production} asRates={true} />
                                    { this.props.productionSuffix }
                                </div>
                            }
                            {
                                Object.keys(this.props.consumption).length > 0 &&
                                <div className={this.props.hasInsufficientResources ? 'text-grey' : ''}>
                                    Consuming: <ResourceAmounts amounts={this.props.consumption} asRates={true} invert={true} />
                                </div>
                            }
                            {
                                Object.keys(this.props.capacity).length > 0 &&
                                <div className={this.props.hasInsufficientResources ? 'text-grey' : ''}>
                                    Capacity: <ResourceAmounts amounts={this.props.capacity} />
                                </div>
                            }
                            <span className="text-red">{this.props.statusMessage}</span>
                        </div>

                        <Upgrades structure={this.props.structure}/>
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
        numBuilt: structure.count.total === 0 ? '' : structure.count.total,

        production: getStatistic(structure, 'produces'),
        consumption: getStatistic(structure, 'consumes'),
        capacity: getStatistic(structure, 'capacity'),

        productionSuffix: productionSuffix,

        hasInsufficientResources: hasInsufficientResources(structure),
        imageKey: getImage(structure),
        statusMessage: getStatusMessage(structure)
    }
};

export default connect(
    mapStateToProps,
    { buildStructure, researchUpgrade }
)(Structure);

