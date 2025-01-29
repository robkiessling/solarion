import React from 'react';
import { connect } from 'react-redux';
import ResourceAmounts from "../ui/resource_amounts";
import * as fromUpgrades from "../../redux/modules/upgrades";
import {canResearchUpgrade, researchUpgrade} from "../../redux/reducer";
import ProgressButton from "../ui/progress_button";
import _ from "lodash";
import {highlightCosts} from "../../redux/modules/resources";

class Upgrade extends React.Component {
    render() {
        return <ProgressButton
            fullWidth={false}
            onClick={() => this.props.researchUpgrade(this.props.id)}
            disabled={!this.props.canResearch}
            progress={this.props.progress}
            showAsPercent={true}
            className='upgrade'
            tooltipId={`upgrade-${this.props.id}-tip`}
            tooltipProps={this.props.tooltipProps}
            tooltip={
                <div>
                    <p className='tooltip-header'>
                        <span className='upgrade'>{this.props.name}</span>
                    </p>
                    <p dangerouslySetInnerHTML={{__html: this.props.description}}/>
                    {!_.isEmpty(this.props.cost) && <p>Cost: <ResourceAmounts amounts={this.props.cost}/></p>}
                    {this.props.researchTime > 0 && <p>Research Time: {_.round(this.props.researchTime)}s</p>}
                </div>
            }>
            <span className={'icon-upgrade'}></span>
            {this.props.name}
        </ProgressButton>;
    }
}

const mapStateToProps = (state, ownProps) => {
    const upgrade = fromUpgrades.getUpgrade(state.upgrades, ownProps.id);

    return {
        id: upgrade.id,
        name: upgrade.name,
        description: upgrade.description,
        cost: highlightCosts(state.resources, fromUpgrades.getResearchCost(upgrade)),
        researchTime: upgrade.researchTime,
        canResearch: canResearchUpgrade(state, upgrade),
        progress: fromUpgrades.getProgress(upgrade, true)
    }
};

export default connect(
    mapStateToProps,
    { researchUpgrade }
)(Upgrade);