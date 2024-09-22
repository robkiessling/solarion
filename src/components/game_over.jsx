
import React from 'react';
import {connect} from "react-redux";
import {resetState, saveState} from "../lib/local_storage";

class GameOver extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return <div id="app-container" className="game-over">
            <div className="game-over-text">
                Game Over
            </div>
            <div>
                Thanks for playing :)
            </div>
            <div className={'game-over-buttons'}>
                <button onClick={() => {
                    window.location.reload();
                }}>Re-watch End-game</button>
                <button onClick={() => {
                    resetState()
                    window.location.reload();
                }}>Restart</button>
            </div>
        </div>
    }
}


// Updates to these fields will trigger re-renders
const mapStateToProps = state => {
    return {}
};

export default connect(
    mapStateToProps,
    {}
)(GameOver);