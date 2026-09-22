import React from 'react';
import { connect } from 'react-redux';
import ResourceAmounts from "../ui/resource_amounts";
import * as fromAbilities from "../../redux/modules/abilities";
import {canCastAbility, castAbility} from "../../redux/reducer";
import ProgressButton from "../ui/progress_button";
import _ from "lodash";
import {highlightCosts} from "../../redux/modules/resources";
import Tooltip from "../ui/tooltip";

/**
 * An ability's cast button with its tooltip. `disabledReason` (optional, from the parent) holds the button
 * disabled for a reason outside the ability's own readiness/cost, and says why in the tooltip.
 */
class Ability extends React.Component {

    render() {
        return <div key={this.props.id} className={'ability'}>
            <ProgressButton
                fullWidth={false}
                onClick={() => this.props.castAbility(this.props.id)}
                disabled={!this.props.canCast || !!this.props.disabledReason}
                progress={this.props.progress}
                className={`ability ${this.props.hidden ? 'hidden' : ''}`}
                tooltipId={`ability-${this.props.id}-tip`}
                tooltipProps={this.props.tooltipProps}
                tooltip={
                    <div>
                        <p className='tooltip-header'>
                            <span className='ability'>{this.props.name}</span>
                        </p>
                        <p>{this.props.description}</p>
                        {!_.isEmpty(this.props.cost) && <p>Cost: <ResourceAmounts amounts={this.props.cost} /></p>}
                        {this.props.castTime > 0 && <p>Time: {_.round(this.props.castTime)}s</p>}
                        {this.props.cooldown > 0 && <p>Cooldown: {_.round(this.props.cooldown)}s</p>}
                        {this.props.disabledReason && <p>{this.props.disabledReason}</p>}
                    </div>
                }>
                {this.props.name}
            </ProgressButton>
            {
                (this.props.displayInfo || this.props.autocastable) && <div className='ability-info'>
                    { this.props.displayInfo && <div>{ this.props.displayInfo }</div> }
                    {
                        // Auto-build (the standing order), under the info line: lit while on. Casts back to back while
                        // affordable; a stalled order says why.
                        this.props.autocastable &&
                        <React.Fragment>
                            <button className={`action-button autocast-toggle${this.props.autocast ? ' on' : ''}`}
                                    data-tip data-for={`ability-${this.props.id}-auto-tip`}
                                    onClick={(event) => {
                                        // A clicked button keeps keyboard focus, and react-tooltip shows on focus:
                                        // coming back to the window would refocus it and reopen the tooltip
                                        // with no mouse to leave. Drop the focus with the click.
                                        event.currentTarget.blur();
                                        this.props.setAutocast(this.props.id, !this.props.autocast);
                                    }}>
                                {this.props.autocast ? '■ Auto-build: on' : '□ Auto-build: off'}
                            </button>
                            {/*{ this.props.autocast && !this.props.canCast && !this.props.isCasting &&*/}
                            {/*    <span className='autocast-waiting'>waiting on resources</span> }*/}
                            <Tooltip id={`ability-${this.props.id}-auto-tip`} {...(this.props.tooltipProps || {})}>
                                <div>
                                    <p className='tooltip-header'><span className='ability'>Auto-build</span></p>
                                    <p>Builds again the moment each build ends, for as long as the factory can pay.</p>
                                </div>
                            </Tooltip>
                        </React.Fragment>
                    }
                </div>
            }
        </div>;
    }
}

const mapStateToProps = (state, ownProps) => {
    const ability = fromAbilities.getAbility(state.abilities, ownProps.id);

    return {
        id: ability.id,
        name: ability.name,
        description: ability.description,
        cost: highlightCosts(state.resources, fromAbilities.getAbilityCost(ability)),
        castTime: ability.castTime,
        cooldown: ability.cooldown,
        canCast: canCastAbility(state, ability),
        progress: fromAbilities.getProgress(ability, true),
        displayInfo: ability.displayInfo,
        hidden: ability.hidden,
        autocastable: !!ability.autocastable,
        autocast: !!ability.autocast,
        isCasting: fromAbilities.isCasting(ability)
    }
};

export default connect(
    mapStateToProps,
    { castAbility, setAutocast: fromAbilities.setAutocast }
)(Ability);