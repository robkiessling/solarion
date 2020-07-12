import React from 'react';
import {round} from "../lib/helpers";

export default function Resource(props) {
    let rateText = null;
    if (props.rate > 0) {
        rateText = <span className="text-green"> (+{props.rate}/s)</span>
    }
    else if (props.rate < 0) {
        rateText = <span className="text-red"> ({props.rate}/s)</span>
    }

    let capacityText = null;
    if (props.capacity < Infinity) {
        capacityText = `/${props.capacity}`;
    }

    return (
        // TODO Maybe don't round? Can be in situation where it shows you have 10 resource, but you really have
        //      9.6, so you can't actually build things that cost 10. 
        <div className="resource">
            {props.name}: {round(props.quantity)}
            {capacityText}
            {rateText}
        </div>
    );
}
