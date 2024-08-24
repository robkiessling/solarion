import React from 'react';
import {connect} from "react-redux";
import Structure from "./structures/structure";
import Harvester from "./structures/harvester";
import {getVisibleIds} from "../redux/modules/structures";

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
                                case 'harvester':
                                    return <Harvester key={id}/>
                                default:
                                    return <Structure type={id} key={id} />
                            }
                        })
                    }
                </div>
                <div className="generators">
                    {
                        this.props.generatorStructureIds.map((id) => {
                            return <Structure type={id} key={id} />
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
    };
};

export default connect(
    mapStateToProps,
    null
)(Structures);

