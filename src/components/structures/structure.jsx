import React from 'react';
import gameClock from "../../singletons/game_clock"
import resources from "../../singletons/resource_manager"

export default class Structure extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            total: 0,
            active: 0
        };

        this.build = this.build.bind(this);
    }

    build() {
        if (resources.consume('minerals', this.props.cost)) {
            this.setState(prevState => {
                return {
                    total: prevState.total + 1
                };
            });
        }
        else {
            console.warn("Failed to build: not enough resources.");
        }
    }

    costString() {
        return this.props.cost === undefined ? "" : ` (-${this.props.cost})`;
    }

    render() {
        return (
            <div className="structure">
                <div className="header">
                    <div className="name">{this.props.name}</div>
                    <div className="count">{this.state.total}</div>
                </div>
                <div className="buttons">
                    <button onClick={this.build}>Build {this.props.name}{this.costString()}</button>
                    {this.props.buttons}
                </div>
            </div>
        );
    }
}

