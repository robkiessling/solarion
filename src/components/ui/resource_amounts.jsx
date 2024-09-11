import React from 'react';
import ResourceAmount from "./resource_amount";
import {getIcon} from "../../redux/modules/resources";

/**
 *
 * @param props
 *   - amounts (required) An object where keys are resourceIds and values are resource amounts
 *   - invert (optional) If true, amount will be made negative
 *   - asRate (optional) If true, resource will be shown with +/- sign and /s suffix
 *   - colorRate (optional) If true (and asRate is also true), the rates will be colored red/green based on +/-
 */
export default function ResourceAmounts(props) {

    if (Object.keys(props.amounts).length === 0) {
        return null;
    }

    return (
        <span>
            {
                Object.entries(props.amounts).map(([resourceId, amount]) => {
                    return <ResourceAmount key={resourceId} icon={getIcon(resourceId)} amount={amount}
                                           invert={props.invert} asRate={props.asRate} colorRate={props.colorRate}
                    />
                })
            }
        </span>
    );
}
