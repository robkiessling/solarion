import React from 'react';
import {connect} from 'react-redux';

// Shown while a long hidden-tab absence is being replayed (game.catchUp; driven by singletons/game_clock.ts).
// Deliberately just a busy notice: it is up for well under a second, too brief to read anything more, and the
// terminal line that follows carries the details.
class CatchUpOverlay extends React.Component {
    render() {
        if (!this.props.catchUp) { return null; }

        return (
            <div className="catch-up-overlay">
                <div className="catch-up-box">Resuming operations<span className="catch-up-ellipsis">...</span></div>
            </div>
        );
    }
}

const mapStateToProps = state => ({ catchUp: state.game.catchUp });

export default connect(mapStateToProps, null)(CatchUpOverlay);
