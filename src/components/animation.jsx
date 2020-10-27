import React from 'react';
import database from '../database/animations'
import gameClock from "../singletons/game_clock";

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

        const image = this.animation[newKey];

        if (Array.isArray(image)) {
            const animationLength = image.reduce((accumulator, currentValue) => {
                return accumulator + currentValue.duration;
            }, 0);
            let timeElapsed = 0;

            gameClock.setInterval(this.intervalId(), (iterations, period) => {
                timeElapsed += (iterations * period) / 1000;
                const timeIntoAnimation = timeElapsed % animationLength;
                this.setState({
                    frame: this._imageForTime(image, timeIntoAnimation)
                })
            }, 1000 / FPS);
        }
        else {
            gameClock.clearInterval(this.intervalId());
            this.setState({
                frame: image
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

        const style = this.animation.style;

        return (
            <div className="image">
                {
                    this.animation.background &&
                        <div className="image-layer" style={style}>
                            { this.animation.background.map((imageRow, index) => {
                                return <span key={index}>{imageRow}</span>
                            }) }
                        </div>
                }
                <div className="image-layer" style={style}>
                    {
                        this.state.frame &&
                        this.state.frame.ascii.map((imageRow, index) => {
                            // imageRow = imageRow.replace('<', '&lt;').replace('>', '&gt;'); // todo hack...
                            return <span key={index}>{imageRow}</span>
                        })
                    }
                </div>
            </div>
        );
    }
}
