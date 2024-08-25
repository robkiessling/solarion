import React from 'react';
import { connect } from 'react-redux';
import { NAV_TAB_TITLES, updateSetting } from "../redux/modules/game";

class NavigationTabs extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className={`navigation-tabs ${this.props.visible ? '' : 'hidden'}`}>
                {this.props.visibleNavTabs.map(tab =>
                    <a key={tab} onClick={() => this.props.updateSetting('currentNavTab', tab)}
                       className={`tab ${tab === this.props.currentNavTab ? 'current-tab' : ''}`}>
                        {tab === this.props.currentNavTab ? '[[' : ''}
                        {NAV_TAB_TITLES[tab]}
                        {tab === this.props.currentNavTab ? ']]' : ''}
                    </a>
                )}
            </div>
        );
    }
}

// Updates to these fields will trigger re-renders
const mapStateToProps = state => {
    return {
        visible: state.game.visibleNavTabs.length,
        visibleNavTabs: state.game.visibleNavTabs,
        currentNavTab: state.game.currentNavTab
    }
};

export default connect(
    mapStateToProps,
    { updateSetting }
)(NavigationTabs);