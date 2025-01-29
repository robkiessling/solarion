import React from "react";
import {connect} from "react-redux";
import {getStructureAbilityIds} from "../../redux/reducer";
import Ability from "./ability";

class Abilities extends React.Component {
    constructor(props) {
        super(props);
    }
    render() {

        return <div className="abilities-area">
            {
                this.props.abilityIds.map(id => {
                    return <Ability key={id} id={id} tooltipProps={this.props.tooltipProps}/>
                })
            }
        </div>
    }
}

const mapStateToProps = (state, ownProps) => {
    const structure = ownProps.structure;

    return {
        abilityIds: getStructureAbilityIds(state, structure)
    }
};

export default connect(
    mapStateToProps,
    null
)(Abilities);

