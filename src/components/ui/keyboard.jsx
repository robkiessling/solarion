import React from 'react';
import {connect} from "react-redux";
import {ARROW_DIRECTIONS, arrowKeyPressed} from "../../redux/modules/keyboard";
import {moveExpedition} from "../../redux/modules/planet";
import {DIRECTIONS} from "../../lib/planet_map";

class Keyboard extends React.Component{
    constructor(props) {
        super(props);
        this.handleKeyDown = this.handleKeyDown.bind(this);
    }

    componentDidMount() {
        window.addEventListener('keydown', this.handleKeyDown);
    }

    componentWillUnmount() {
        window.removeEventListener('keydown', this.handleKeyDown);
    }

    handleKeyDown(event) {
        switch (event.key) {
            case 'ArrowUp':
                // this.props.arrowKeyPressed(ARROW_DIRECTIONS.up);
                this.props.moveExpedition(DIRECTIONS.north);
                event.preventDefault();
                break;
            case 'ArrowDown':
                // this.props.arrowKeyPressed(ARROW_DIRECTIONS.down);
                this.props.moveExpedition(DIRECTIONS.south);
                event.preventDefault();
                break;
            case 'ArrowLeft':
                // this.props.arrowKeyPressed(ARROW_DIRECTIONS.left);
                this.props.moveExpedition(DIRECTIONS.west);
                event.preventDefault();
                break;
            case 'ArrowRight':
                // this.props.arrowKeyPressed(ARROW_DIRECTIONS.right);
                this.props.moveExpedition(DIRECTIONS.east);
                event.preventDefault();
                break;
            default:
                break;
        }
    }

    render() {
        return null;
    }
}

const mapStateToProps = state => {
    return {}
}

// export default Keyboard;
export default connect(
    mapStateToProps,
    { arrowKeyPressed, moveExpedition }
)(Keyboard);