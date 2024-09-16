import React from 'react';
import {connect} from "react-redux";
import {hasInsufficientResources} from "../../redux/modules/structures";
import { getStructure } from "../../redux/modules/structures";
import {buildStructure, getStructureStatistic, researchUpgrade, showDroidsForStructure} from "../../redux/reducer";

import 'rc-slider/assets/index.css';
import ResourceAmounts from "../ui/resource_amounts";
import RunSlider from "./run_slider";
import BuildButton from "./build_button";
import Upgrades from "./upgrades";
import Abilities from "./abilities";
import DroidCount from "./droid_count";
import {getIcon, highlightCosts} from "../../redux/modules/resources";

class Structure extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className="structure">
                <div className="header">
                    <span className="structure-name">
                        {this.props.structure.name}
                        <span className="build-count">{this.props.numBuilt < 1 ? '' : ` x${this.props.numBuilt}`}</span>
                    </span>
                    <div className="build-area">
                        <BuildButton structure={this.props.structure}/>
                    </div>
                </div>
                <div className="description"
                     dangerouslySetInnerHTML={{__html: this.props.structure.description}}></div>

                <div className="body">
                    <div className="details-area">
                        {this.props.isBuilt && this.props.structure.runnable &&
                            <div className={`d-flex justify-center`}><RunSlider structure={this.props.structure}/></div>}
                        {
                            this.props.isBuilt && Object.keys(this.props.production).length > 0 &&
                            <div className={`d-flex space-between ${this.props.hasInsufficientResources ? 'text-grey' : ''}`}>
                                <div>Producing:</div>
                                <div><ResourceAmounts amounts={this.props.production} asRate={true}/></div>
                            </div>
                        }
                        {
                            this.props.isBuilt && Object.keys(this.props.consumption).length > 0 &&
                            <div className={`d-flex space-between ${this.props.hasInsufficientResources ? 'text-grey' : ''}`}>
                                <div>Consuming:</div>
                                <div><ResourceAmounts amounts={this.props.consumption} asRate={true} invert={true}/></div>
                            </div>
                        }
                        { this.props.children }
                        {
                            this.props.isBuilt && this.props.statusMessage &&
                            <div className={`d-flex space-between`}>
                                <div>Status:</div>
                                <div className={'d-flex justify-end'}
                                      dangerouslySetInnerHTML={{__html: this.props.statusMessage}}></div>
                            </div>
                        }
                        {this.props.isBuilt && this.props.showDroidsForStructure &&
                            <DroidCount droidData={this.props.droidData} targetId={this.props.structure.id} />}
                    </div>

                    {this.props.isBuilt && <Abilities structure={this.props.structure}/>}

                    {this.props.isBuilt && <Upgrades structure={this.props.structure}/>}
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

        showDroidsForStructure: showDroidsForStructure(state, structure),
        droidData: structure.droidData,

        production: getStructureStatistic(state, structure, 'produces'),
        consumption: highlightCosts(state.resources, getStructureStatistic(state, structure, 'consumes')),

        hasInsufficientResources: hasInsufficientResources(structure),
        statusMessage: structure.statusMessage
    }
};

export default connect(
    mapStateToProps,
    { buildStructure, researchUpgrade }
)(Structure);

