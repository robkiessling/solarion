import React from 'react';
import { connect } from 'react-redux';
import ResourceAmounts from "./ui/resource_amounts";
import {getUpgrade, pause, resume} from "../redux/modules/upgrades";
import * as fromUpgrades from "../redux/modules/upgrades";
import {canResearchUpgrade, researchUpgrade} from "../redux/reducer";
import {STATES} from "../database/upgrades";
import Tooltip from "./ui/tooltip";
import {highlightCosts} from "../redux/modules/resources";

class ComputerUpgrade extends React.Component {

    _onClick() {
        if (this.props.state === STATES.discovered) {
            this.props.researchUpgrade(this.props.id)
        }
        else if (this.props.state === STATES.researching) {
            this.props.pause(this.props.id)
        }
        else if (this.props.state === STATES.paused) {
            this.props.resume(this.props.id)
        }
    }

    render() {
        const tooltipId = `upgrade-${this.props.id}-tip`;

        return <div className="">
            <div className="computer-upgrade" data-tip data-for={tooltipId}>
                <span>>&nbsp;</span>
                <a className={this.props.canResearch ? '' : 'disabled'}
                   onClick={() => this._onClick()}>
                    {this.props.name}
                </a>
                <span className="progress">
                    {
                        this.props.progress ? `${_.round(this.props.progress)}%` : ''
                    }
                </span>
            </div>

            <Tooltip id={tooltipId} place="right">
                <div>
                    <p>{this.props.description}</p>
                    {
                        this.props.cost && Object.keys(this.props.cost).length > 0 &&
                        <p>Cost: <ResourceAmounts amounts={this.props.cost} /></p>
                    }
                    {this.props.time > 0 && <p>Time: {this.props.time}</p>}
                </div>
            </Tooltip>
        </div>
    }
}

const mapStateToProps = (state, ownProps) => {
    const upgrade = getUpgrade(state.upgrades, ownProps.id);
    
    return {
        id: upgrade.id,
        state: upgrade.state,
        name: upgrade.name,
        description: upgrade.description,
        cost: highlightCosts(state.resources, fromUpgrades.getResearchCost(upgrade)),
        canResearch: canResearchUpgrade(state, upgrade),
        time: upgrade.researchTime,
        progress: fromUpgrades.getProgress(upgrade, true)
    }
};

export default connect(
    mapStateToProps,
    { researchUpgrade, pause, resume }
)(ComputerUpgrade);