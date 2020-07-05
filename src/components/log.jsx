import React from 'react';
import { connect } from 'react-redux';


class Log extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className="log">
                hi
            </div>
        );
    }
}

const mapStateToProps = state => {
    return {};
};

export default connect(
    mapStateToProps,
    {  }
)(Log);