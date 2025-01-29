import React from 'react';
import {connect} from "react-redux";
import Structure from "./structures/structure";
import ProbeFactory from "./structures/probe_factory";
import EnergyBay from "./structures/energy_bay";
import {getVisibleIds} from "../redux/modules/structures";
import {TYPES} from "../database/structures";
import Tabs from "./ui/tabs";
import {updateSetting} from "../redux/modules/game";

import 'overlayscrollbars/styles/overlayscrollbars.css';
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";

class Structures extends React.Component {
    constructor(props) {
        super(props);
    }

    shouldComponentUpdate(nextProps, nextState) {
        // Checking both this props and next props to ensure we update on visibility changes
        return this.props.visible || nextProps.visible;
    }

    render() {
        const tabs = [
            { id: 'all', label: 'All' },
            { id: 'consumers', label: 'Consumers' },
            { id: 'generators', label: 'Producers' },
        ];
        const onTabClick = (tabId) => { this.props.updateSetting('currentStructureTab', tabId) }

        return (
            <div className={`structures ${this.props.visible ? '' : 'hidden'}`}>
                {
                    this.props.structureIds.length ?
                        (
                            // this.props.showStructureTabs ?
                            //     <Tabs tabs={tabs} currentTab={this.props.currentStructureTab} onChange={onTabClick}/> :
                            //     <div className="component-header">Structures</div>
                            this.props.showStructureTabs ?
                                <Tabs tabs={tabs} currentTab={this.props.currentStructureTab} onChange={onTabClick}/> : ''
                        ) : ''
                }
                <OverlayScrollbarsComponent className="structure-list" defer>
                {
                        this.props.structureIds.map((id) => {
                            if (!this.props.showStructuresList) {
                                return <div key={id} className={'hidden'}></div>
                            }
                            switch (id) {
                                case 'energyBay':
                                    return <EnergyBay key={id}/>
                                case 'probeFactory':
                                    return <ProbeFactory key={id}/>
                                default:
                                    return <Structure type={id} key={id}/>
                            }
                        })
                    }
                </OverlayScrollbarsComponent>
            </div>
        );
    }
}

const mapStateToProps = (state, ownProps) => {
    let structureIds = [];

    switch(state.game.currentNavTab) {
        case 'outside':
            switch(state.game.currentStructureTab) {
                case 'all':
                    structureIds = getVisibleIds(state.structures)
                    break;
                case 'consumers':
                    structureIds = getVisibleIds(state.structures, TYPES.consumer)
                    break;
                case 'generators':
                    structureIds = getVisibleIds(state.structures, TYPES.generator)
                    break;
                default:
                    console.warn(`Unhandled tab: ${state.game.currentStructureTab}`)
            }
            structureIds = structureIds.filter(structureId => structureId !== 'probeFactory');
            break;
        case 'star':
            structureIds = ['probeFactory', 'solarPanel']
            break;
    }

    // commandCenter structure is shown on its own in the left column; never show it on the right column
    structureIds = structureIds.filter(structureId => structureId !== 'commandCenter');

    return {
        visible: state.game.currentNavTab === 'outside' || state.game.currentNavTab === 'star',
        showStructureTabs: state.game.showStructureTabs && state.game.currentNavTab === 'outside',
        currentStructureTab: state.game.currentStructureTab,
        structureIds: structureIds,
        showStructuresList: state.game.showStructuresList,
    };
};

export default connect(
    mapStateToProps,
    { updateSetting }
)(Structures);

