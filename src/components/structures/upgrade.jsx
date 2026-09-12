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
        const researching = this.props.researching;
        // While it runs the bar says so: the row shows just the subject ("Harvester Fabrication"), which also keeps
        // long names on one line, and the tooltip header says "Researching: X". Names without the prefix are left alone.
        const name = researching ? this.props.name.replace(/^Research: /, '') : this.props.name;
        const header = researching ? this.props.name.replace(/^Research: /, 'Researching: ') : this.props.name;
        return <ProgressButton
            fullWidth={false}
            onClick={() => this.props.researchUpgrade(this.props.id)}
            disabled={!this.props.canResearch}
            progress={this.props.progress}
            showAsAscii={true}
            className='upgrade'
            tooltipId={`upgrade-${this.props.id}-tip`}
            tooltipProps={this.props.tooltipProps}
            tooltip={
                <div>
                    <p className='tooltip-header'>
                        <span className='upgrade'>{header}</span>
                    </p>
                    <p dangerouslySetInnerHTML={{__html: this.props.description}}/>
                    {researching
                        ? <p>Remaining: {this.props.remainingSeconds}s</p>
                        : <React.Fragment>
                            {!_.isEmpty(this.props.cost) && <p>Cost: <ResourceAmounts amounts={this.props.cost}/></p>}
                            {this.props.researchTime > 0 && <p>Research Time: {_.round(this.props.researchTime)}s</p>}
                        </React.Fragment>}
                </div>
            }>
            <span className={'icon-upgrade'}></span>
            <span className={'label'}>{name}</span>
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
        progress: fromUpgrades.getProgress(upgrade, true),
        researching: upgrade.state === 'researching',
        remainingSeconds: Math.max(0, Math.ceil(upgrade.researchTime - (upgrade.researchProgress || 0) / 1000))
    }
};

export default connect(
    mapStateToProps,
    { researchUpgrade }
)(Upgrade);