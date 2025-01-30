import Modal from 'react-modal';

import React from 'react';
import {connect} from "react-redux";
import {formattedLastSavedAt, updateSetting} from "../redux/modules/game";
import {resetState, saveState} from "../lib/local_storage";
import store, {AUTO_SAVE_INTERVAL} from "../redux/store";
import Slider from "rc-slider";
import {createArray, round} from "../lib/helpers";
import {produce} from "../redux/modules/resources";
import ReactSwitch from "react-switch";

class Settings extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        const maxGameSpeed = 10;

        return <div id="open-settings-div">
            <a id="open-settings" onClick={() => this.props.updateSetting('settingsModalOpen', true)}>
                <span className={'icon-cog'}></span>
            </a>
            <Modal
                isOpen={this.props.settingsModalOpen}
                ariaHideApp={false}
                onRequestClose={() => this.props.updateSetting('settingsModalOpen', false)}
                overlayClassName={'settings-modal-overlay'}
                className={'settings-modal'}
            >
                <div>
                    <div className={'component-header'} style={{fontSize: '2rem'}}>Solarion</div>
                    <a className={'close-modal'} onClick={() => this.props.updateSetting('settingsModalOpen', false)}>
                        <span className={'icon-cancel'}></span>
                    </a>
                    <p>This is a prototype game. Hopefully there are no bugs :)</p>
                </div>
                <div>
                <div className={'component-header'}>Saving</div>
                    <div className={'br'}>
                        <label className={'on-off-switch text-center'}>
                            Auto-save:
                            <ReactSwitch checked={this.props.autoSaveEnabled}
                                         onChange={(checked) => this.props.updateSetting('autoSaveEnabled', checked)}
                                         checkedIcon={false} uncheckedIcon={false} height={12} width={24}
                            />
                            { this.props.autoSaveEnabled ? `Enabled (Every ${round(AUTO_SAVE_INTERVAL / 1000.0)} seconds)` : 'Disabled' }
                        </label>
                    </div>
                    <div className={'br'}>Last saved at: {this.props.lastSavedAt}</div>
                    <div className={'d-flex space-between br'}>
                        <button onClick={() => saveState(store.getState())}>Save Now</button>
                        <button onClick={() => resetState()}>Clear Saved Data</button>
                    </div>
                </div>
                <div>
                    <div className={'component-header'}>Src</div>
                    <p>
                        This app was made using <a target={"_blank"} href={'https://react-redux.js.org/'}>React-Redux</a>.
                    </p>
                    <p>
                        All source code is available in <a target={"_blank"} href={'https://github.com/robkiessling/solarion'}>Github</a>.
                    </p>
                </div>
                {/*<div>*/}
                {/*    <div className={'component-header'}>Dev</div>*/}
                {/*    <div>*/}
                {/*        Game speed:*/}
                {/*        <Slider className={'range-slider'}*/}
                {/*                min={0} max={maxGameSpeed} step={0.5}*/}
                {/*                marks={createArray(maxGameSpeed + 1, i => i).reduce((obj, v) => ({ ...obj, [v]: v }), {})}*/}
                {/*                onChange={(value) => this.props.updateSetting('gameSpeed', value)}*/}
                {/*                value={this.props.gameSpeed}/>*/}
                {/*        <button onClick={() => this.props.produce({*/}
                {/*            energy: 1e10, ore: 1e10, refinedMinerals: 1e10*/}
                {/*        })}>+Resources</button>*/}
                {/*    </div>*/}
                {/*</div>*/}
            </Modal>
        </div>
    }
}

const mapStateToProps = state => {
    return {
        settingsModalOpen: state.game.settingsModalOpen,
        lastSavedAt: formattedLastSavedAt(state.game),
        gameSpeed: state.game.gameSpeed,
        autoSaveEnabled: state.game.autoSaveEnabled
    }
};

export default connect(
    mapStateToProps,
    { updateSetting, produce }
)(Settings);