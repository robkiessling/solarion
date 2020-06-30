import React from 'react';
import { connect } from 'react-redux';

import gameClock from "../singletons/game_clock"
// import resources from "../singletons/resources"
import {consume} from "../redux/modules/resources";

const UPDATES_PER_SECOND = 1;
// const MINERALS_PER_SECOND = 10;

class ResourceBar extends React.Component {
    constructor(props) {
        super(props);

        // this.state = {
        //     minerals: 0
        // };

        this._setupInterval();
    }

    _setupInterval() {
        // gameClock.setInterval('ResourceBar', (iterations, period) => {
        //     // var seconds = iterations * period / 1000;
        //     // this.setState({
        //     //     minerals: this.state.minerals + seconds * MINERALS_PER_SECOND
        //     // })
        //
        //     // redraw UI
        //     this.forceUpdate();
        // }, 1000 / UPDATES_PER_SECOND);

    }

    render() {
        return (
            <div className="resource-bar">
                <button onClick={() => this.props.consume('minerals', 20)} >click!</button>
                <div>
                    {/*Minerals: { resources.currentQuantity('minerals') }*/}

                    Minerals: { this.props.minerals.amount }
                </div>
                <div>
                    Time: { Math.floor(gameClock.total / 1000.0) }
                </div>
            </div>
        );
    }
}

const mapStateToProps = state => {
    return state.resources;
};

export default connect(
    mapStateToProps,
    { consume }
)(ResourceBar);