import React from 'react';
import {connect} from "react-redux";
import Structure from "./structures/structure";
import Harvester from "./structures/harvester";
import {getVisibleIds} from "../redux/modules/structures";
import {TYPES} from "../database/structures";
import Tabs from "./ui/tabs";
import {updateSetting} from "../redux/modules/game";

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
                <div className="structure-list">
                {
                        this.props.structureIds.map((id) => {
                            switch (id) {
                                // TODO This is just an example if we need vastly different Structure components
                                case 'harvester':
                                    return <Harvester key={id}/>
                                default:
                                    return <Structure type={id} key={id}/>
                            }
                        })
                    }
                </div>
            </div>
        );
    }
}

const mapStateToProps = (state, ownProps) => {
    let structureType;
    switch(state.game.currentStructureTab) {
        case 'all':
            structureType = undefined;
            break;
        case 'consumers':
            structureType = TYPES.consumer;
            break;
        case 'generators':
            structureType = TYPES.generator;
            break;
        default:
            console.warn(`Unhandled tab: ${state.game.currentStructureTab}`)
    }

    return {
        visible: state.game.currentNavTab === 'outside',
        showStructureTabs: state.game.showStructureTabs,
        currentStructureTab: state.game.currentStructureTab,
        structureIds: getVisibleIds(state.structures, structureType)
    };
};

export default connect(
    mapStateToProps,
    { updateSetting }
)(Structures);

