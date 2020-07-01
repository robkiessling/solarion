import React from 'react';
import gameClock from "../singletons/game_clock"
import Structure from "./structures/structure";
import Harvester from "./structures/harvester";

export default class Structures extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className="structures">
                <Structure type="harvester" />
                {/*<Structure name="Solar Panel" />*/}
                {/*<Structure name="Wind Turbine"/>*/}
            </div>
        );
    }
}