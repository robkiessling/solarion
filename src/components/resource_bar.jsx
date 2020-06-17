import React from 'react';
import gameClock from "../singletons/game_clock"
import resources from "../singletons/resources"

const UPDATES_PER_SECOND = 1;
// const MINERALS_PER_SECOND = 10;

export default class ResourceBar extends React.Component {
    constructor(props) {
        super(props);

        // this.state = {
        //     minerals: 0
        // };

        this._setupInterval();
    }

    _setupInterval() {
        gameClock.setInterval('ResourceBar', (iterations, period) => {
            // var seconds = iterations * period / 1000;
            // this.setState({
            //     minerals: this.state.minerals + seconds * MINERALS_PER_SECOND
            // })

            // redraw UI
            this.forceUpdate();
        }, 1000 / UPDATES_PER_SECOND);

    }

    render() {
        return (
            <div className="resource-bar">
                <div>
                    Minerals: { resources.currentQuantity('minerals') }
                </div>
                <div>
                    Time: { Math.floor(gameClock.total / 1000.0) }
                </div>
            </div>
        );
    }
}