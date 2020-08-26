import React from 'react';
import {timePeriodData} from "../redux/modules/clock";

export default function Clock(props) {
    const timePeriod = timePeriodData(props.fractionOfDay)[1];

    const secondsOfDay = props.fractionOfDay * (24 * 60 * 60);
    const hour = Math.floor(secondsOfDay / (60 * 60));
    const minutes = _.padStart(Math.round((secondsOfDay % (60 * 60)) / 60), 2, '0');

    return <div>
        Day { props.dayNumber } &mdash; { hour }:{ minutes } ({ timePeriod })
        {/*&mdash; { nextTimePeriod } in { Math.round(periodRemaining) }s*/}
    </div>;
}
