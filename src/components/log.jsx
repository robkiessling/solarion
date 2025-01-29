import React from 'react';
import { connect } from 'react-redux';
import LogSection from "./log_section";
import {debounce} from "../lib/helpers";
import 'overlayscrollbars/styles/overlayscrollbars.css';
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";

class Log extends React.Component {
    constructor(props) {
        super(props);

        this.logRef = React.createRef();
    }

    componentDidMount() {
        this.scrollToBottom();

        // window.addEventListener("resize", debounce(() => this.scrollToBottom()));
    }

    scrollToBottom() {
        if (this.logRef.current) {
            let osInstance = this.logRef.current.osInstance();

            if (osInstance) {
                const { scrollOffsetElement } = osInstance.elements();
                scrollOffsetElement.scrollTop = scrollOffsetElement.scrollHeight - scrollOffsetElement.clientHeight;
            }
        }
    }

    render() {
        return (
            <div className={`log-container ${this.props.visible ? '' : 'invisible'}`}>
                <div className="component-header">Terminal</div>

                <OverlayScrollbarsComponent className="log" ref={this.logRef} defer>
                    {
                        this.props.visibleSequenceIds.map((sequenceId, index) => {
                            return <LogSection sequenceId={sequenceId}
                                               key={sequenceId}
                                               onUpdate={() => this.scrollToBottom()}
                                               active={index === (this.props.visibleSequenceIds.length - 1)}
                            />;
                        })
                    }
                </OverlayScrollbarsComponent>
                <div className="log-gradient"/>
            </div>

        );
    }
}

const mapStateToProps = state => {
    return {
        visible: state.game.showTerminal,
        visibleSequenceIds: state.log.visibleSequenceIds
    }

};

export default connect(
    mapStateToProps,
    null
)(Log);