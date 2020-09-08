import React from 'react';
import { connect } from 'react-redux';

class Computer extends React.Component {
    constructor(props) {
        super(props);

        // this.logRef = React.createRef();
    }

    // onUpdate() {
    //     let log = this.logRef.current;
    //
    //     // Scroll to the bottom of the log
    //     log.scrollTop = log.scrollHeight;
    // }

    render() {
        return (
            <div className="computer-container">
                <div className="computer">
                    <b>Computing</b>
                </div>
            </div>

        );
    }
}

const mapStateToProps = state => {
    return {
        // visibleSequenceIds: state.log.visibleSequenceIds
    }

};

export default connect(
    mapStateToProps,
    null
)(Computer);