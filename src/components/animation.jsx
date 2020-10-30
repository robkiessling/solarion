import React from 'react';
import database, {UNKNOWN_IMAGE} from '../database/animations'
import gameClock from "../singletons/game_clock";
import {UNKNOWN_IMAGE_KEY} from "../redux/modules/structures";

const FPS = 30;

export default class Animation extends React.Component {
    constructor(props) {
        super(props);

        this.animation = database[this.props.id];
        this.state = { frame: null };
    }

    componentDidMount() {
        this.changeImage(this.props.imageKey);
    }

    /**
     *  Only redrawing if imageKey changes (using setState). More efficient than letting React decide whether
     *  to re-render, because we just have to compare one string as opposed to actually building the ascii images.
     */
    componentDidUpdate(prevProps, prevState) {
        if (prevProps.imageKey !== this.props.imageKey) {
            this.changeImage(this.props.imageKey);
        }
    }

    componentWillUnmount() {
        gameClock.clearInterval(this.intervalId())
    }

    intervalId() {
        return `${this.props.id}-animation`;
    }

    changeImage(newKey) {
        if (!this.animation) {
            return null;
        }

        const image = newKey === UNKNOWN_IMAGE_KEY ? UNKNOWN_IMAGE : this.animation[newKey];
        const background = newKey === UNKNOWN_IMAGE_KEY ? null : this.animation.background;
        const style = newKey === UNKNOWN_IMAGE_KEY ? {} : this.animation.style;

        if (Array.isArray(image)) {
            const animationLength = image.reduce((accumulator, currentValue) => {
                return accumulator + currentValue.duration;
            }, 0);
            let timeElapsed = 0;

            gameClock.setInterval(this.intervalId(), (iterations, period) => {
                timeElapsed += (iterations * period) / 1000;
                const timeIntoAnimation = timeElapsed % animationLength;
                this.setState({
                    frame: this._imageForTime(image, timeIntoAnimation),
                    background: background,
                    style: style
                })
            }, 1000 / FPS);
        }
        else {
            gameClock.clearInterval(this.intervalId());
            this.setState({
                frame: image,
                background: background,
                style: style
            });
        }
    }

    _imageForTime(animations, timeIntoAnimation) {
        let cur = 0;
        for (let i = 0, len = animations.length; i < len; i++) {
            cur += animations[i].duration;
            if (timeIntoAnimation < cur) {
                return animations[i];
            }
        }
        return null;
    }

    render() {
        if (!this.animation) {
            return <div className="image"/>;
        }

        return (
            <div className="image">
                {
                    this.state.background &&
                    <div className="image-layer" style={this.state.style}>
                        {
                            this.state.background.map((imageRow, index) => {
                                return <span key={index}>{imageRow}</span>
                            })
                        }
                    </div>
                }
                {
                    this.state.frame &&
                    <div className="image-layer" style={this.state.style}>
                        {
                            this.state.frame.ascii.map((imageRow, index) => {
                                // imageRow = imageRow.replace('<', '&lt;').replace('>', '&gt;'); // todo hack...
                                return <span key={index}>{imageRow}</span>
                            })
                        }
                    </div>
                }
            </div>
        );
    }
}
