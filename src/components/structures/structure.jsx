import React from 'react';
import {connect} from "react-redux";
import {
    getProduction, getConsumption,
    getNumRunning, setRunning
} from "../../redux/modules/structures";
import { getStructure, getBuildCost } from "../../redux/modules/structures";
import {
    canBuildStructure,
    buildStructure,
    getVisibleUpgrades,
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
                                    Produces: <ResourceAmounts amounts={this.props.perStructure.production} asRates={true} /> each
                                </div>
                            }
                            {
                                Object.keys(this.props.consumption).length > 0 &&
                                <div>
                                    Consumes: <ResourceAmounts amounts={this.props.perStructure.consumption} asRates={true} invert={true} /> each
                                </div>
                            }
                        </div>
                    </div>
                    <div class="upgrades-container">
                        {
                            this.props.upgrades.map((upgradeData) => {
                                const tipId = `upgrade-${upgradeData.id}-tip`;
                                return <div>
                                    <button key={upgradeData.id}
                                            onClick={() => this.props.researchUpgrade(upgradeData.id)}
                                            disabled={!upgradeData.canResearch} className="has-tip">
                                        <span data-tip data-for={tipId}>{upgradeData.name}</span>
                                    </button>
                                    <ReactTooltip id={tipId} place="right" effect="solid" className="game-tooltip">
                                        <p>
                                            {upgradeData.description}
                                        </p>
                                        Cost: <ResourceAmounts amounts={upgradeData.cost} />
                                    </ReactTooltip>
                                </div>

                            })
                        }
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
        production: getProduction(structure),
        consumption: getConsumption(structure),
        perStructure: {
            production: getProduction(structure, 1),
            consumption: getConsumption(structure, 1),
        },
        isRunning: getNumRunning(structure) > 0,
        numBuilt: structure.count.total,
        canRun: canRunStructure(state, structure),
        numRunning: getNumRunning(structure),
        upgrades: getVisibleUpgrades(state, structure)
    }
};

export default connect(
    mapStateToProps,
    { buildStructure, setRunning, researchUpgrade }
)(Structure);

