import React from "react";
import {connect} from "react-redux";
import {castAbility, getStructureAbilities} from "../../redux/reducer";
import ResourceAmounts from "../ui/resource_amounts";
import ProgressButton from "../ui/progress_button";
import _ from "lodash";

class Abilities extends React.Component {
    constructor(props) {
        super(props);
    }
    render() {

        return <div className="abilities-area">
            {
                this.props.abilities.map(ability => {
                    const tipId = `ability-${ability.id}-tip`;
                    return <div key={ability.id}>
                        <ProgressButton
                            fullWidth={false}
                            onClick={() => this.props.castAbility(ability.id)}
                            disabled={!ability.canCast}
                            progress={ability.progress}
                            tooltipId={tipId}
                            tooltip={
                                <div>
                                    <p>
                                        {ability.description}
                                    </p>
                                    {!_.isEmpty(ability.cost) && <p>Cost: <ResourceAmounts amounts={ability.cost} /></p>}
                                    {ability.castTime && <p>Time: {_.round(ability.castTime)}s</p>}
                                </div>
                            }>
                            {ability.name}
                        </ProgressButton>
                        {
                            ability.displayInfo && <div className='ability-info'>{ ability.displayInfo }</div>
                        }
                    </div>;
                })
            }
        </div>
    }
}

const mapStateToProps = (state, ownProps) => {
    const structure = ownProps.structure;

    return {
        abilities: getStructureAbilities(state, structure)
    }
};

export default connect(
    mapStateToProps,
    { castAbility }
)(Abilities);

