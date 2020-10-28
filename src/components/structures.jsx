import React from 'react';
import {connect} from "react-redux";
import Structure from "./structures/structure";
import MineralHarvester from "./structures/mineral_harvester";
import {getVisibleIds} from "../redux/modules/structures";
import {getStandaloneIds} from "../redux/modules/upgrades";
import Upgrade from "./upgrade";

class Structures extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className="structures">
                <div className="consumers">
                    {
                        this.props.consumerStructureIds.map((id) => {
                            switch(id) {
                                case 'mineralHarvester':
                                    return <MineralHarvester key={id}/>
                                default:
                                    return <Structure type={id} key={id} />
                            }
                        })
                    }
                    {
                        this.props.consumerUpgradeIds.map((id) => {
                            return <Upgrade id={id} key={id}/>
                        })
                    }
                </div>
                <div className="generators">
                    {
                        this.props.generatorStructureIds.map((id) => {
                            return <Structure type={id} key={id} />
                        })
                    }
                    {
                        this.props.generatorUpgradeIds.map((id) => {
                            return <Upgrade id={id} key={id}/>
                        })
                    }
                </div>
            </div>
        );
    }
}

const mapStateToProps = (state) => {
    return {
        consumerStructureIds: getVisibleIds(state.structures, 'consumer'),
        generatorStructureIds: getVisibleIds(state.structures, 'generator'),

        consumerUpgradeIds: getStandaloneIds(state.upgrades, 'consumer'),
        generatorUpgradeIds: getStandaloneIds(state.upgrades, 'generator'),

    };
};

export default connect(
    mapStateToProps,
    null
)(Structures);

