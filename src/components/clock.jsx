import React from 'react';
import {timePeriodData} from "../redux/modules/clock";

export default function Clock(props) {
    const timePeriod = timePeriodData(props.fractionOfDay)[1];

    const secondsOfDay = props.fractionOfDay * (24 * 60 * 60);
    const hour = Math.floor(secondsOfDay / (60 * 60));
    const minutes = _.padStart(Math.round((secondsOfDay % (60 * 60)) / 60), 2, '0');

    return <div>
        <div className={'d-flex space-between'}>
            <span>Time:</span>
            <span>Day { props.dayNumber } { hour }:{ minutes }</span>
        </div>
        <div className={'d-flex space-between'}>
            <span>Period:</span>
            {/*<span>{ hour }:{ minutes } ({ timePeriod })</span>*/}
            {/*<span>{ hour }:{ minutes }</span>*/}
            <span>{timePeriod}</span>
        </div>
        {/*Day: { props.dayNumber } { hour }:{ minutes } ({ timePeriod })*/}
        {/*&mdash; { nextTimePeriod } in { Math.round(periodRemaining) }s*/}
    </div>;
}
