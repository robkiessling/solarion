import React from 'react';
import {connect} from "react-redux";
import {
    getStatistic,
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
import Upgrades from "./upgrades";
import Abilities from "./abilities";

class Structure extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className="structure">
                <div className="left-side">
                    <span className="build-count">{this.props.numBuilt === 0 ? '' : this.props.numBuilt}</span>
                    <Animation id={this.props.structure.id} imageKey={this.props.imageKey} />
                    <BuildButton structure={this.props.structure}/>
                </div>
                <div className="right-side">
                    <div className="header">
                        <span className="structure-name">{this.props.structure.name}</span>
                    </div>
                    <div className="description">
                        {this.props.structure.description}
                    </div>

                    {this.props.isBuilt && <Abilities structure={this.props.structure}/>}

                    <div className="body">
                        <div className="details-area">
                            {this.props.isBuilt && this.props.structure.runnable && <RunSlider structure={this.props.structure}/>}

                            {
                                this.props.isBuilt && Object.keys(this.props.production).length > 0 &&
                                <div className={this.props.hasInsufficientResources ? 'text-grey' : ''}>
                                    Producing: <ResourceAmounts amounts={this.props.production} asRates={true}/>
                                    {this.props.structure.productionSuffix}
                                </div>
                            }
                            {
                                this.props.isBuilt && Object.keys(this.props.consumption).length > 0 &&
                                <div className={this.props.hasInsufficientResources ? 'text-grey' : ''}>
                                    Consuming: <ResourceAmounts amounts={this.props.consumption} asRates={true}
                                                                invert={true}/>
                                    {this.props.structure.consumptionSuffix}
                                </div>
                            }
                            {
                                this.props.isBuilt && Object.keys(this.props.capacity).length > 0 &&
                                <div className={this.props.hasInsufficientResources ? 'text-grey' : ''}>
                                    Capacity: <ResourceAmounts amounts={this.props.capacity}/>
                                </div>
                            }
                            <span className="text-red">{this.props.statusMessage}</span>
                        </div>

                        {this.props.isBuilt && <Upgrades structure={this.props.structure}/>}
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
        numBuilt: structure.count.total,
        isBuilt: structure.count.total > 0,

        production: getStatistic(structure, 'produces'),
        consumption: getStatistic(structure, 'consumes'),
        capacity: getStatistic(structure, 'capacity'),

        hasInsufficientResources: hasInsufficientResources(structure),
        imageKey: structure.imageKey,
        statusMessage: getStatusMessage(structure)
    }
};

export default connect(
    mapStateToProps,
    { buildStructure, researchUpgrade }
)(Structure);

