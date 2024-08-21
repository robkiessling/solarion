import React from "react";
import {connect} from "react-redux";
import {getStructureUpgrades, researchUpgrade} from "../../redux/reducer";
import ResourceAmounts from "../ui/resource_amounts";
import Tooltip from "../ui/tooltip";

class Upgrades extends React.Component {
    constructor(props) {
        super(props);
    }
    render() {

        return <div className="upgrades-area">
            {
                this.props.upgrades.map(upgrade => {
                    const tipId = `upgrade-${upgrade.id}-tip`;
                    return <div key={upgrade.id}>
                        <button onClick={() => this.props.researchUpgrade(upgrade.id)}
                                disabled={!upgrade.canResearch}
                                className="has-tip">
                            <span data-tip data-for={tipId}>
                                {upgrade.name}
                            </span>
                        </button>
                        <Tooltip id={tipId} place="right">
                            <p>
                                <span className="tooltip-header">{upgrade.name}</span>
                            </p>
                            <p>
                                {upgrade.description}
                            </p>
                            <p>
                                Cost: <ResourceAmounts amounts={upgrade.cost} />
                            </p>
                        </Tooltip>
                    </div>;
                })
            }
        </div>
    }
}

const mapStateToProps = (state, ownProps) => {
    const structure = ownProps.structure;

    return {
        upgrades: getStructureUpgrades(state, structure)
    }
};

export default connect(
    mapStateToProps,
    { researchUpgrade }
)(Upgrades);

