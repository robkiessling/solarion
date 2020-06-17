import React from 'react';
import gameClock from "../../singletons/game_clock"
import Structure from "./structure";

export default class Harvester extends React.Component {
    constructor(props) {
        super(props);

        // this.state = { /* blah blah blah */ };
    }

    render() {
        return (
            <Structure name="Harvester"
                       cost={50}
                       buttons={
                           <button>Custom Button</button>
                       }
            />
        );
    }
}