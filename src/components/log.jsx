import React from 'react';
import { connect } from 'react-redux';
import LogSection from "./log_section";
import 'overlayscrollbars/styles/overlayscrollbars.css';
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";

class Log extends React.Component {
    constructor(props) {
        super(props);

        this.logRef = React.createRef();
        this.state = { flashing: false };
        this.wasAtBottom = true;
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

    componentDidUpdate(prevProps) {
        // A new sequence starting means the terminal is speaking (narrative only; telemetry has its own feeds).
        // Pulse the panel so it catches the eye from across the screen. Growth-only check: the initial mount
        // (restoring a save's whole history) never flashes.
        if (this.props.visibleSequenceIds.length > prevProps.visibleSequenceIds.length) {
            this.flash();
        }
    }

    componentWillUnmount() {
        clearTimeout(this.flashTimeout);
        this.resizeObserver.disconnect();
    }

    flash() {
        clearTimeout(this.flashTimeout);
        // Drop and re-add the class across a frame so back-to-back sequences restart the CSS animation
        this.setState({ flashing: false }, () => {
            requestAnimationFrame(() => this.setState({ flashing: true }));
        });
        this.flashTimeout = setTimeout(() => this.setState({ flashing: false }), 3000);
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
            <div className={`log-container ${this.props.visible ? '' : 'invisible'} ${this.state.flashing ? 'terminal-flash' : ''}`}>
                <div className="component-header">Terminal</div>

                <OverlayScrollbarsComponent className="log" ref={this.logRef} defer
                                            events={{ scroll: (instance) => this.trackScrollPosition(instance) }}>
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