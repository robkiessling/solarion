import React from "react";
import {connect} from "react-redux";
import {castAbility, getStructureAbilities} from "../../redux/reducer";
import ResourceAmounts from "../ui/resource_amounts";
import ProgressButton from "../ui/progress_button";

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
                                    Cost: <ResourceAmounts amounts={ability.cost} />
                                </div>
                            }>
                            {ability.name}
                        </ProgressButton>
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

