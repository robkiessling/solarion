import React from "react";
import {connect} from "react-redux";
import {getStructureUpgrades, researchUpgrade} from "../../redux/reducer";
import ReactTooltip from "react-tooltip";
import ResourceAmounts from "../ui/resource_amounts";

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
                        <ReactTooltip id={tipId} place="right" effect="solid" className="game-tooltip">
                            <p>
                                {upgrade.description}
                            </p>
                            Cost: <ResourceAmounts amounts={upgrade.cost} />
                        </ReactTooltip>
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

