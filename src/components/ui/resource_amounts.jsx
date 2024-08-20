import React from 'react';
import ResourceRate from "./resource_rate";
import {getIcon} from "../../redux/modules/resources";

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
                    const icon = getIcon(k);
                    return props.asRates ? <ResourceRate rate={rate} icon={icon} key={k} /> :
                        <span key={k}>{rate}<span className={icon}/></span>
                })
            }
        </span>
    );
}
