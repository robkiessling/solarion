import React from 'react';
import {connect} from "react-redux";
import Structure from "./structures/structure";
import MineralHarvester from "./structures/mineral_harvester";

class Structures extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className="structures">
                {
                    this.props.visibleIds.map((id) => {
                        switch(id) {
                            case 'mineralHarvester':
                                return <MineralHarvester key={id}/>
                            default:
                                return <Structure type={id} key={id} />
                        }
                    })
                }
            </div>
        );
    }
}

const mapStateToProps = (state) => {
    return {
        visibleIds: state.structures.visibleIds
    };
};

export default connect(
    mapStateToProps,
    null
)(Structures);

