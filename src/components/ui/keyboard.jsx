import React from 'react';
import {connect} from "react-redux";
import {ARROW_DIRECTIONS, arrowKeyPressed} from "../../redux/modules/keyboard";

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
                event.preventDefault();
                break;
            case 'ArrowDown':
                // this.props.arrowKeyPressed(ARROW_DIRECTIONS.down);
                event.preventDefault();
                break;
            case 'ArrowLeft':
                // this.props.arrowKeyPressed(ARROW_DIRECTIONS.left);
                event.preventDefault();
                break;
            case 'ArrowRight':
                // this.props.arrowKeyPressed(ARROW_DIRECTIONS.right);
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
    { arrowKeyPressed }
)(Keyboard);