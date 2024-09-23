
import React from 'react';
import {connect} from "react-redux";
import {resetState, saveState} from "../lib/local_storage";

class Error extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return <div id="app-container" className="app-error">
            <div style={{fontSize: '2rem'}}>
                An error occurred preventing this page from rendering :(
            </div>
            <div className={'game-over-buttons'}>
                <button onClick={() => {
                    resetState()
                    window.location.reload();
                }}>Restart</button>
            </div>
        </div>
    }
}


const mapStateToProps = state => {
    return {}
};

export default connect(
    mapStateToProps,
    {}
)(Error);