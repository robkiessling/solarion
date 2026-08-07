import _ from 'lodash';
import React from 'react';
import {batch, connect} from 'react-redux';
import database from '../database/logs';
import {endLogSequence, getLogData} from "../redux/modules/log";

const DEBUG = false;

class LogSection extends React.Component {
    constructor(props) {
        super(props);

        this.logSectionRef = React.createRef();
        this.pendingTimeouts = new Set();
    }

    // All timers must go through this helper so componentWillUnmount can cancel them
    scheduleTimeout(fn, delay) {
        const id = setTimeout(() => {
            this.pendingTimeouts.delete(id);
            fn();
        }, delay);
        this.pendingTimeouts.add(id);
    }

    componentDidMount() {
        const databaseRecord = database[this.props.logData.id]

        if (this.props.logData.status === 'completed') {
            this.backfillSequence(databaseRecord);
        }
        else {
            this.logSequence(databaseRecord);
        }

        // this.unsubscribe = store.subscribe(this.onStoreChange);
    }

    componentWillUnmount() {
        // Cancel any in-flight sequence timers. Without this, a sequence still printing when the app
        // swaps to the game-over or error screen keeps dispatching endLogSequence/onFinish into the dead game.
        this.pendingTimeouts.forEach(id => clearTimeout(id));
        this.pendingTimeouts.clear();
    }

    // Just displaying it for historical purposes; skipping all callbacks
    backfillSequence(databaseRecord) {
        const logSection = this.logSectionRef.current;
        const text = databaseRecord.text;

        if (_.isArray(text)) {
            for (let i = 0, len = text.length; i < len; i++) {
                let node = document.createElement('p');
                node.appendChild(document.createTextNode(text[i][0]));
                logSection.appendChild(node);
            }
        }
        else {
            let node = document.createElement('p');
            node.appendChild(document.createTextNode(text));
            logSection.appendChild(node);
        }

        this.props.onUpdate();
    }

    logSequence(databaseRecord) {
        const logSection = this.logSectionRef.current;
        const dispatch = this.props.dispatch;

        const text = databaseRecord.text;
        let i = 0, len = text.length;

        if (len === 0) {
            batch(() => {
                if (databaseRecord.onFinish) { databaseRecord.onFinish(dispatch); }
                dispatch(endLogSequence(this.props.logData.sequence));
            })
            return;
        }

        // Each line has 3 elements in an array:
        //  0: The text to display
        //  1: How long to delay after the text is shown
        //  2: If true, briefly flashes the text
        const printNextLine = (delay) => {
            this.scheduleTimeout(() => {
                let node = document.createElement('p');
                node.appendChild(document.createTextNode(text[i][0]));

                if (text[i][2] && text[i][0]) {
                    node.classList.add('flash');
                    this.scheduleTimeout(() => {
                        node.classList.add('fade-flash');
                    }, 250)
                }

                logSection.appendChild(node);
                this.props.onUpdate();
                let nextDelay = text[i][1];
                if (DEBUG) { nextDelay /= 10; } // makes the log go 10x faster

                i++;
                if (i < len) {
                    printNextLine(nextDelay);
                }
                else {
                    this.scheduleTimeout(() => {
                        batch(() => {
                            if (databaseRecord.onFinish) { databaseRecord.onFinish(dispatch); }
                            dispatch(endLogSequence(this.props.logData.sequence));
                        })
                    }, nextDelay)
                }
            }, delay);
        }

        printNextLine(0);
    }

    render() {
        return (
            <div className={`log-section ${this.props.active ? 'active' : 'inactive'}`} ref={this.logSectionRef}/>
        );
    }
}

const mapStateToProps = (state, ownProps) => {
    const logData = getLogData(state.log, ownProps.sequenceId);

    return {
        logData: logData
    }
};

export default connect(
    mapStateToProps,
    null // Intentionally null so we can manually pass `dispatch` to certain functions
)(LogSection);