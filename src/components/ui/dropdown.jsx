import React from 'react';
import { connect } from 'react-redux';

class Dropdown extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return <select onChange={e => this.props.onChange(e.target.value)} value={this.props.selected}>
            {
                this.props.options.map(option => {
                    return <option key={option.value} value={option.value}>
                        {option.text}
                    </option>
                })
            }
        </select>
    }
}

/**
 * options is an array of objects, such as:
 *   [ { text: 'Option 1', value: 'opt1' }, { text: 'Option 2', value: 'opt2' } ]
 * selected is the value of which option to select
 * onChange is a callback that should update what value is selected
 */
const mapStateToProps = (state, ownProps) => {
    return {
        options: ownProps.options,
        selected: ownProps.selected,
        onChange: ownProps.onChange
    }
};

// todo this does not need redux connect
export default connect(
    mapStateToProps,
    null
)(Dropdown);