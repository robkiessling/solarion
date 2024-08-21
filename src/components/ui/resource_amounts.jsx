import React from 'react';
import ResourceRate from "./resource_rate";
import {getIcon} from "../../redux/modules/resources";
import {isObject} from "lodash";

export default function ResourceAmounts(props) {

    if (Object.keys(props.amounts).length === 0) {
        return null;
    }

    return (
        <span>
            {
                Object.entries(props.amounts).map(([resourceId,amount]) => {
                    let notEnough = false;
                    if (isObject(amount)) {
                        // Amount has been converted using `highlightCosts` -> need to deconstruct it
                        notEnough = !amount.hasEnough;
                        amount = amount.amount;
                    }

                    amount = _.round(amount, 1);
                    if (props.invert) { amount = amount * -1; }
                    const icon = getIcon(resourceId);

                    if (props.asRates) {
                        // Todo ResourceRate does not support hasEnough property
                        return <ResourceRate rate={amount} icon={icon} key={resourceId} />
                    }
                    else {
                        return <span key={resourceId} className={`resource-cost ${notEnough ? 'text-red' : ''}`}>
                            {amount}
                            <span className={icon}/>
                        </span>
                    }
                })
            }
        </span>
    );
}
