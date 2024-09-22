import React from 'react';
import { connect } from 'react-redux';

class Tabs extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className={`tabs`}>
                {this.props.tabs.map(tabData => {
                    const { id , label } = tabData;
                    return <a key={id} onClick={() => this.props.onChange(id)}
                              className={`tab ${id === this.props.currentTab ? 'current-tab' : ''}`}>
                        {label}
                    </a>
                })}
            </div>
        );
    }
}

const mapStateToProps = (state, ownProps) => {
    return {
        tabs: ownProps.tabs,
        currentTab: ownProps.currentTab,
        onChange: ownProps.onChange
    }
};

export default connect(
    mapStateToProps,
    null
)(Tabs);