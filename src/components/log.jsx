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
        log.scrollTop = log.scrollHeight - log.clientHeight;
    }

    render() {
        return (
            <div className="log-container">
                <div className="component-header">Terminal</div>
                <div className="log" ref={this.logRef}>
                {
                        this.props.visibleSequenceIds.map((sequenceId, index) => {
                            return <LogSection sequenceId={sequenceId}
                                               key={sequenceId}
                                               onUpdate={() => this.onUpdate()}
                                               active={index === (this.props.visibleSequenceIds.length - 1)}
                            />
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