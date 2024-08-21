import React from 'react';
import { connect } from 'react-redux';
import ResourceAmounts from "../ui/resource_amounts";
import * as fromAbilities from "../../redux/modules/abilities";
import {canCastAbility, castAbility} from "../../redux/reducer";
import ProgressButton from "../ui/progress_button";
import _ from "lodash";

class Ability extends React.Component {

    render() {
        return <div key={this.props.id}>
            <ProgressButton
                fullWidth={false}
                onClick={() => this.props.castAbility(this.props.id)}
                disabled={!this.props.canCast}
                progress={this.props.progress}
                tooltipId={`ability-${this.props.id}-tip`}
                tooltip={
                    <div>
                        <p>{this.props.description}</p>
                        {!_.isEmpty(this.props.cost) && <p>Cost: <ResourceAmounts amounts={this.props.cost} /></p>}
                        {this.props.castTime > 0 && <p>Time: {_.round(this.props.castTime)}s</p>}
                    </div>
                }>
                {this.props.name}
            </ProgressButton>
            {
                this.props.displayInfo && <div className='ability-info'>{ this.props.displayInfo }</div>
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
        cost: fromAbilities.getAbilityCost(ability),
        castTime: ability.castTime,
        canCast: canCastAbility(state, ability),
        progress: fromAbilities.getProgress(ability, true),
        displayInfo: ability.displayInfo
    }
};

export default connect(
    mapStateToProps,
    { castAbility }
)(Ability);