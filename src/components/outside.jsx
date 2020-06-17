import React from 'react';
import gameClock from "../singletons/game_clock"

export default class Outside extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className="outside">
                Imagine a cool ASCII landscape here :P
            </div>
        );
    }
}