import React from 'react';
import { connect } from 'react-redux';
import LogSection from "./log_section";
import 'overlayscrollbars/styles/overlayscrollbars.css';
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";

class Log extends React.Component {
    constructor(props) {
        super(props);

        this.logRef = React.createRef();
        this.wasAtBottom = true;

        // Entries already in the log when the terminal mounts are history (a reload); anything added later is
        // new and gets the white-then-fade treatment. A running sequence can tell from its status, but inline
        // entries and logMessage entries are stored as 'completed' from the start, so this snapshot is what
        // distinguishes new from restored for them.
        this.initialSequenceIds = new Set(props.visibleSequenceIds);
    }

    componentDidMount() {
        this.scrollToBottom();

        // The panel can be resized by outside layout changes (the command center panel growing when new
        // upgrades appear, window resizes). Stay pinned to the newest line through those, but only if
        // already at the bottom; a player reading scrollback shouldn't be yanked down.
        this.resizeObserver = new ResizeObserver(() => {
            if (this.wasAtBottom) {
                this.scrollToBottom();
            }
        });
        if (this.logRef.current) {
            this.resizeObserver.observe(this.logRef.current.getElement());
        }
    }

    componentWillUnmount() {
        this.resizeObserver.disconnect();
    }

    // Called by sections as lines print. Follow the feed only if the player was already at the
    // bottom -- same rule as the resize path; reading scrollback shouldn't be interrupted.
    onSectionUpdate() {
        if (this.wasAtBottom) {
            this.scrollToBottom();
        }
    }

    scrollToBottom() {
        this.jumpToBottom();

        // Lines are appended to the DOM directly (see log_section.jsx), so OverlayScrollbars may not have
        // observed the mutation yet when this runs -- a stale scrollHeight leaves the newest line just below
        // the fold. Jump again on the next frame, after its size recalculation.
        requestAnimationFrame(() => this.jumpToBottom());
    }

    jumpToBottom() {
        if (this.logRef.current) {
            let osInstance = this.logRef.current.osInstance();

            if (osInstance) {
                osInstance.update(); // force a content-size recalculation before measuring
                const { scrollOffsetElement } = osInstance.elements();
                scrollOffsetElement.scrollTop = scrollOffsetElement.scrollHeight - scrollOffsetElement.clientHeight;
            }
        }
    }

    // Runs on every scroll (including our own jumpToBottom calls, which re-mark it true)
    trackScrollPosition(osInstance) {
        const { scrollOffsetElement } = osInstance.elements();
        const distanceFromBottom = scrollOffsetElement.scrollHeight
            - (scrollOffsetElement.scrollTop + scrollOffsetElement.clientHeight);
        this.wasAtBottom = distanceFromBottom <= 4; // small tolerance; scrollTop can be fractional
    }

    render() {
        return (
            <div className={`log-container ${this.props.visible ? '' : 'invisible'}`}>
                <div className="component-header">Terminal</div>

                <OverlayScrollbarsComponent className="log" ref={this.logRef} defer
                                            events={{ scroll: (instance) => this.trackScrollPosition(instance) }}>
                    {
                        this.props.visibleSequenceIds.map((sequenceId) => {
                            return <LogSection sequenceId={sequenceId}
                                               key={sequenceId}
                                               onUpdate={() => this.onSectionUpdate()}
                                               fresh={!this.initialSequenceIds.has(sequenceId)}
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