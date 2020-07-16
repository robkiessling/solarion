import React from 'react';

export default function ResourceRate(props) {
    let className = '';
    let text = `${props.rate}`;

    if (props.rate > 0) {
        className = 'text-green';
        text = `+${text}`;
    }
    else if (props.rate < 0) {
        className = 'text-red';
    }
    else {
        
    }

    if (props.units) {
        text = `${text}${props.units}`;
    }

    text = `${text}/s`;

    if (props.parenthesis) {
        text = `(${text})`;
    }

    return <span className={className}>{text}</span>;
}
