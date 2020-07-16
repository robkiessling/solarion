import React from 'react';
import _ from "lodash";
import ResourceRate from "./resource_rate";

export default function ResourceAmounts(props) {

    if (Object.keys(props.amounts).length === 0) {
        return null;
    }

    return (
        <span>
            {
                Object.entries(props.amounts).map(([k,v]) => {
                    let rate = _.round(v, 1);
                    if (props.invert) { rate = rate * -1; }
                    const units = k[0];
                    return props.asRates ? <ResourceRate rate={rate} units={units} key={k} /> :
                        <span key={k}>{rate}{units}</span>
                })
            }
            </span>
    );
}
