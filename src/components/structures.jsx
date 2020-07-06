import React from 'react';
import {connect} from "react-redux";
import Structure from "./structures/structure";
import CommandCenter from "./structures/command_center";

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
                            case 'commandCenter':
                                return <CommandCenter type={id} key={id}/>
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

