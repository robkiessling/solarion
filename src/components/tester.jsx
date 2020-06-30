import React from 'react';
import { connect } from 'react-redux';

// import resources from "../singletons/resources"
import {consume} from "../redux/modules/resources";

class Tester extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className="resource-bar">
                <button onClick={() => this.props.consume('minerals', 20)} disabled={this.props.minerals.amount < 20}>click!</button>
                <div>
                    {/*Minerals: { resources.currentQuantity('minerals') }*/}

                    Minerals: { this.props.minerals.amount }
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
)(Tester);