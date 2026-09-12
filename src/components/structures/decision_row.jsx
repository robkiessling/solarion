import React from 'react';
import {connect} from 'react-redux';
import database from '../../database/decisions';
import {openDecision} from '../../redux/modules/decisions';

/**
 * A pending decision request on a structure card: the terminal has something to ask (database/decisions.ts) and
 * put it on the desk instead of taking the screen. Sits in the card's upgrade list with a marker that is yellow
 * until the popup has been opened for it, grey after (the request is still there; the player has just looked and
 * left). Click opens the decision popup.
 */
function DecisionRow({ id, seen, openDecision }) {
    const record = database[id];
    return (
        <div className={`decision-row ${seen ? 'seen' : 'unseen'}`} onClick={() => openDecision(id)}>
            <span className="decision-marker">!</span>
            <span className="label">{record.label}</span>
        </div>
    );
}

export default connect(null, { openDecision })(DecisionRow);
