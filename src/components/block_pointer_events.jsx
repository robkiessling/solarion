import React from 'react';
import { connect } from 'react-redux';

// Blocks pointer events for entire page
class BlockPointerEvents extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div id={'block-pointer-events'} className={`${this.props.visible ? '' : 'hidden'}`}></div>
        );
    }
}

const mapStateToProps = state => {
    return {
        visible: state.game.blockPointerEvents
    }
};

export default connect(
    mapStateToProps,
    null
)(BlockPointerEvents);