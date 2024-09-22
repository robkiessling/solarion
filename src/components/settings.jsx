import Modal from 'react-modal';

import React from 'react';
import {connect} from "react-redux";
import {formattedLastSavedAt, updateSetting} from "../redux/modules/game";
import {resetState, saveState} from "../lib/local_storage";
import store from "../redux/store";

class Settings extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
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
                    <p>Auto-save: Every 30 seconds</p>
                    <p>Last saved at: {this.props.lastSavedAt}</p>
                    <p>
                        <button onClick={() => saveState(store.getState())}>Save Now</button>&emsp;
                        <button onClick={() => resetState()}>Clear Saved Data</button>
                    </p>
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
            </Modal>
        </div>
    }
}

const mapStateToProps = state => {
    return {
        settingsModalOpen: state.game.settingsModalOpen,
        lastSavedAt: formattedLastSavedAt(state.game)
    }
};

export default connect(
    mapStateToProps,
    { updateSetting }
)(Settings);