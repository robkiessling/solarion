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
import {paintImage} from "../../lib/helpers";
import ResourceAmounts from "../ui/resource_amounts";

class Structure extends React.Component {
    constructor(props) {
        super(props);

        this.imageRef = React.createRef();
    }

    componentDidMount() {
        if (this.props.structure.image) {
            paintImage(this.props.structure.image.ascii, this.imageRef.current, this.props.structure.image.style);
        }
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

        return (
            <div className="structure">
                <div className="left-side">
                    <div className="image" ref={this.imageRef}/>
                </div>
                <div className="right-side">
                    <div className="header">
                        <div className="name">{this.props.structure.name}</div>
                        <div className="count">{this.props.structure.buildable && this.props.numBuilt}</div>
                    </div>
                    <div className="description">
                        {this.props.structure.description}
                    </div>
                    <div className="buttons">
                        {
                            this.props.structure.buildable &&
                            <button onClick={() => this.props.buildStructure(this.props.type, 1)} disabled={!this.props.canBuild}>
                                Build (<ResourceAmounts amounts={this.props.cost} />)
                            </button>
                        }
                        {
                            this.props.structure.runnable &&
                            <Slider className={'range-slider'} min={0} max={this.props.numBuilt} marks={sliderMarks}
                                    onChange={(value) => this.props.setRunning(this.props.type, value)}
                                    disabled={!this.props.canRun}
                                    value={this.props.numRunning}
                            />
                        }
                        {this.props.buttons}
                    </div>
                    {
                        Object.keys(this.props.production).length > 0 &&
                        <div>
                            Production: <ResourceAmounts amounts={this.props.production} asRates={true} />
                        </div>
                    }
                    {
                        Object.keys(this.props.consumption).length > 0 &&
                        <div>
                            Consumption: <ResourceAmounts amounts={this.props.consumption} asRates={true} invert={true} />
                        </div>
                    }
                    <div>
                        {
                            this.props.upgrades.map((upgradeData) => {
                                return <button key={upgradeData.id}
                                               onClick={() => this.props.researchUpgrade(this.props.structure.id, upgradeData.id)}
                                               disabled={!upgradeData.canResearch}>
                                    {upgradeData.name} (<ResourceAmounts amounts={upgradeData.cost} />)
                                </button>
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
        isRunning: structure.count.running === structure.count.total,
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

