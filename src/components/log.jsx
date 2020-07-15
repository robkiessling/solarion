import React from 'react';
import { connect } from 'react-redux';
import LogSection from "./log_section";

class Log extends React.Component {
    constructor(props) {
        super(props);

        this.logRef = React.createRef();
    }

    onUpdate() {
        let log = this.logRef.current;

        // Scroll to the bottom of the log
        log.scrollTop = log.scrollHeight;
    }

    render() {
        return (
            <div className="log-container">
                <div className="log" ref={this.logRef}>
                    {
                        this.props.visibleSequenceIds.map((sequenceId) => {
                            return <LogSection sequenceId={sequenceId} key={sequenceId} onUpdate={() => this.onUpdate()} />
                        })
                    }
                </div>
                <div className="log-gradient"/>
            </div>

        );
    }
}

const mapStateToProps = state => {
    return {
        visibleSequenceIds: state.log.visibleSequenceIds
    }

};

export default connect(
    mapStateToProps,
    null
)(Log);