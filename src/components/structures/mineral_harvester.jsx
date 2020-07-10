import React from 'react';
// import {connect} from "react-redux";
// import {build, getProduction, getConsumption} from "../../redux/modules/structures";
// import { getStructure, getBuildCost } from "../../redux/modules/structures";
// import {toString} from "../../redux/modules/resources";
// import {canBuildStructure} from "../../redux/reducer";
import Structure from "./structure";


export default class MineralHarvester extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <Structure
                type="mineralHarvester"

            />
        );
    }
}

// const mapStateToProps = (state, ownProps) => {
//     const structure = getStructure(state.structures, ownProps.type);
//
//     return {
//         structure: structure,
//         canBuild: canBuildStructure(state, structure),
//         cost: getBuildCost(structure),
//         production: getProduction(structure),
//         consumption: getConsumption(structure)
//     }
// };
//
// export default connect(
//     mapStateToProps,
//     { build }
// )(MineralHarvester);

