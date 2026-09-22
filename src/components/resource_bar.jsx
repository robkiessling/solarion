import React from 'react';
import { connect } from 'react-redux';

import {getDroidCounts, getNetResourceRates, numRecallableDroids, recallAllDroids} from "../redux/reducer";
import {getCapacity, getLifetimeQuantity, getQuantity} from "../redux/modules/resources";
import ResourceAmount from "./ui/resource_amount";
import Tooltip from "./ui/tooltip";
import {isTargetingPlanet} from "../redux/modules/star";

// Bar cells render in this fixed order regardless of learn order (unknown ids get appended in learn order)
const DISPLAY_ORDER = ['energy', 'ore', 'refinedMinerals', 'standardDroids', 'probes'];

/**
 * Full-width HUD bar along the top of the app. Each resource is a two-line cell: amount on top, rate dimmed
 * underneath. Droids are a special cell showing the total census with the idle count in the rate slot, plus
 * the unassign link (every assigned droid back to idle, for reassigning from scratch). It sits here because
 * this cell is the droid tally on every tab, and it arrives with the structures' bulk ++ / -- buttons.
 * The resource name is a native title on the icon only (the glyph is the part that needs naming); on the whole
 * cell it would pop up over the unassign link's own tooltip.
 */
class ResourceBar extends React.Component {
    orderedIds() {
        return [...this.props.visibleIds].sort((a, b) => {
            const ai = DISPLAY_ORDER.indexOf(a), bi = DISPLAY_ORDER.indexOf(b);
            return (ai === -1 ? DISPLAY_ORDER.length : ai) - (bi === -1 ? DISPLAY_ORDER.length : bi);
        });
    }

    renderDroidCell(resource) {
        const { total, idle } = this.props.droidCounts;

        return <div className="resource-cell droid-cell" key={resource.id}>
            <div className="cell-amount">
                <span className="resource-amount">
                    {/* A quiet link, not a button: the bar is a readout, and a white button outweighs the numbers.
                        Beside the total, not the idle count, so it can't be read as "unassign the idle". Gone
                        when there is nothing to unassign. */}
                    {this.props.showRecall && this.props.numRecallable > 0 &&
                        <a className="recall-droids" onClick={() => this.props.recallAllDroids()}
                           data-tip data-for="recall-droids-tip">unassign</a>}
                    {total}
                </span>
                <div className="cell-rate">{idle} idle</div>
                {/* Same condition as the link: ReactTooltip binds its hover listeners once, on mount, so the two
                    must mount together or a link that shows up later never gets a tooltip. The field team line
                    waits for the Planet tab so it does not give away expeditions early. */}
                {this.props.showRecall && this.props.numRecallable > 0 &&
                    <Tooltip id="recall-droids-tip" place="bottom">
                        <p className="tooltip-header">Unassign All Droids</p>
                        <p>Unassigns every droid at base. Structures lose their droid boost until
                            droids are reassigned.</p>
                        {this.props.expeditionsAvailable && <p>A team in the field is not affected.</p>}
                    </Tooltip>}
            </div>
            <span className={`cell-icon ${resource.icon}`} title={resource.name}/>
        </div>;
    }

    renderCell(id) {
        const resource = this.props.resources[id];
        if (id === 'standardDroids') { return this.renderDroidCell(resource); }

        const quantity = getQuantity(resource);
        let showRate = resource.showRate;
        let capacity = getCapacity(resource);

        if (id === 'energy' && this.props.mirroringToPlanet) {
            capacity = undefined;
            showRate = false;
        }

        return <div className="resource-cell" key={id}>
            <div className="cell-amount">
                <ResourceAmount amount={quantity} capacity={capacity}/>
                {
                    this.props.showResourceRates &&
                    <div className="cell-rate">
                        {showRate && <ResourceAmount amount={this.props.netResourceRates[id]} asRate={true} colorRate={true}/>}
                    </div>
                }
            </div>
            <span className={`cell-icon ${resource.icon}`} title={resource.name}/>
        </div>;
    }

    render() {
        return (
            <div className={`resource-bar ${this.props.visible ? '' : 'invisible'}`}>
                {this.orderedIds().map(id => this.renderCell(id))}
            </div>
        );
    }
}

const mapStateToProps = state => {
    return {
        visible: state.game.showResourceBar,
        showResourceRates: state.game.showResourceRates,
        visibleIds: state.resources.visibleIds,
        resources: state.resources.byId,
        netResourceRates: getNetResourceRates(state),
        droidCounts: getDroidCounts(state),
        numRecallable: numRecallableDroids(state),
        expeditionsAvailable: state.game.visibleNavTabs.includes('planet'), // the Expedition card arrives with the tab
        showRecall: getLifetimeQuantity(state.resources.byId.standardDroids) >= 10, // as DroidCount's bulk buttons
        mirroringToPlanet: isTargetingPlanet(state.star)
    }
};

export default connect(
    mapStateToProps,
    { recallAllDroids }
)(ResourceBar);
