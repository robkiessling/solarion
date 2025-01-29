import React from "react";
import {connect} from "react-redux";
import {getStructureUpgradeIds} from "../../redux/reducer";
import Upgrade from "./upgrade";
import 'overlayscrollbars/styles/overlayscrollbars.css';
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";

class Upgrades extends React.Component {
    constructor(props) {
        super(props);
    }
    render() {
        if (this.props.scrollable) {
            return <OverlayScrollbarsComponent className="upgrades-area scrollable" defer>
                {
                    this.props.upgradeIds.map(id => {
                        return <Upgrade key={id} id={id} tooltipProps={this.props.tooltipProps}/>
                    })
                }
            </OverlayScrollbarsComponent>
        }
        else {
            return <div className="upgrades-area">
                {
                    this.props.upgradeIds.map(id => {
                        return <Upgrade key={id} id={id} tooltipProps={this.props.tooltipProps}/>
                    })
                }
            </div>
        }
    }
}

const mapStateToProps = (state, ownProps) => {
    const structure = ownProps.structure;

    return {
        upgradeIds: getStructureUpgradeIds(state, structure)
    }
};

export default connect(
    mapStateToProps,
    null
)(Upgrades);