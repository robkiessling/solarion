import React from 'react';
import { connect } from 'react-redux';
import ResourceAmounts from "./ui/resource_amounts";
import {getUpgrade} from "../redux/modules/upgrades";
import * as fromUpgrades from "../redux/modules/upgrades";
import {canResearchUpgrade, researchUpgrade} from "../redux/reducer";
import ProgressButton from "./ui/progress_button";

class Upgrade extends React.Component {

    render() {
        return <ProgressButton
            fullWidth={true}
            onClick={() => this.props.researchUpgrade(this.props.id)}
            disabled={!this.props.canResearch}
            tooltipId={`upgrade-${this.props.id}-tip`}
            progress={this.props.progress}
            tooltip={
                <div>
                    <p className="tooltip-header">{this.props.description}</p>
                    <p>Cost: <ResourceAmounts amounts={this.props.cost} /></p>
                </div>
            }>
            <b>{this.props.name}</b><br/>
            {this.props.description}
        </ProgressButton>;
    }
}

const mapStateToProps = (state, ownProps) => {
    const upgrade = getUpgrade(state.upgrades, ownProps.id);

    return {
        id: upgrade.id,
        name: upgrade.name,
        description: upgrade.description,
        cost: fromUpgrades.getResearchCost(upgrade),
        canResearch: canResearchUpgrade(state, upgrade),
        progress: fromUpgrades.getProgress(upgrade, true)
    }
};

export default connect(
    mapStateToProps,
    { researchUpgrade }
)(Upgrade);