import React from 'react';
import {batch, connect} from 'react-redux';
import database from '../database/logs';
import {endLogSequence, getLogData} from "../redux/modules/log";

class LogSection extends React.Component {
    constructor(props) {
        super(props);

        this.logSectionRef = React.createRef();
    }

    componentDidMount() {
        const databaseRecord = database[this.props.logData.id]

        if (this.props.logData.status === 'completed') {
            this.logInstant(databaseRecord);
        }
        else {
            this.logSequence(databaseRecord);
        }

        // this.unsubscribe = store.subscribe(this.onStoreChange);
    }

    // componentWillUnmount() {
    //     this.unsubscribe();
    // }
    //
    // onStoreChange() {
    //     const newState = store.getState();
    // }

    logInstant(databaseRecord) {
        const logSection = this.logSectionRef.current;
        const text = databaseRecord.text;

        for (let i = 0, len = text.length; i < len; i++) {
            let node = document.createElement('p');
            node.appendChild(document.createTextNode(text[i][0]));
            logSection.appendChild(node);
        }

        this.props.onUpdate();
    }

    logSequence(databaseRecord) {
        const logSection = this.logSectionRef.current;
        const dispatch = this.props.dispatch;

        const text = databaseRecord.text;
        let i = 0, len = text.length;

        const printNextLine = (delay) => {
            setTimeout(() => {
                let node = document.createElement('p');
                node.appendChild(document.createTextNode(text[i][0]));
                logSection.appendChild(node);
                this.props.onUpdate();
                let nextDelay = text[i][1];

                i++;
                if (i < len) {
                    printNextLine(nextDelay);
                }
                else {
                    batch(() => {
                        databaseRecord.onFinish(dispatch);
                        dispatch(endLogSequence(this.props.logData.sequence));
                    })
                }
            }, delay);
        }

        printNextLine(0);
    }


    // TODO on window resize -> scroll to bottom

    render() {
        return (
            <div className="log-section" ref={this.logSectionRef}/>
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