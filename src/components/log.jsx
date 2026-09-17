import React from 'react';
import {batch, connect} from 'react-redux';
import database from '../database/logs';
import {finishHead, printLine} from "../redux/modules/log";
import 'overlayscrollbars/styles/overlayscrollbars.css';
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";

import {LOG_SPEED} from "../dev/skips";
import {play as playSfx} from "../singletons/audio";

const DEFAULT_CHAR_DELAY = 30; // ms per character in 'chars' mode
const DEFAULT_FRAME_DELAY = 200; // ms per frame in 'frames' mode
const MIN_TICK_CHAR_DELAY = 15; // no typing tick below this ms per character (a sped-up run would just buzz)

// Database lines come in two shapes: the legacy tuple [text, delayAfterMs, flash] and an options
// object { text, delay, flash, sound, className, style, mode: 'chars' | 'frames', charDelay, frames, frameDelay }.
function normalizeLine(line) {
    return Array.isArray(line) ? { text: line[0], delay: line[1], flash: line[2] } : line;
}

// Fills {placeholders} from the vars queued with the sequence. Unknown placeholders are left as-is so a
// typo is visible rather than silently blank.
function interpolate(text, vars) {
    if (!vars) { return text; }
    return text.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

// The terminal. Renders the printed lines from the store and plays the queue (see redux/modules/log.ts):
// the head entry's lines are committed to the store one by one as they land, paced by the database delays.
// A line that animates in (typing, progress frames) is committed with its full text up front and drawn with
// a local partial override until it lands, so the store never holds half a line and a mid-line reload just
// shows the whole line.
//
// Line colouring is CSS-only (log.scss): a line committed this session gets .landed when it lands, which
// runs the white-then-grey settle animation (and the flash, if the line asked for one). Restored history has
// no .landed and sits at the scrollback grey.
class Log extends React.Component {
    constructor(props) {
        super(props);

        this.logRef = React.createRef();
        this.wasAtBottom = true;
        this.pendingTimeouts = new Set();

        // Lines with an id below this were restored from the save, not printed this session
        this.sessionStartId = props.nextId;
        // Queue entry ids: the one being played, and the last one finished (props can lag a finish by a tick)
        this.playingId = null;
        this.finishedId = null;

        this.state = {
            partial: null // { id, text } while a line is animating in; overrides the stored text
        };
    }

    componentDidMount() {
        this.scrollToBottom();

        // The panel can be resized by outside layout changes (the command center panel growing when new
        // upgrades appear, window resizes). Stay pinned to the newest line through those, but only if
        // already at the bottom; a player reading scrollback shouldn't be yanked down.
        this.resizeObserver = new ResizeObserver(() => {
            if (this.wasAtBottom) {
                this.scrollToBottom();
            }
        });
        if (this.logRef.current) {
            this.resizeObserver.observe(this.logRef.current.getElement());
        }

        this.playHead();
    }

    componentDidUpdate(prevProps, prevState) {
        if (prevProps.lines !== this.props.lines || prevState.partial !== this.state.partial) {
            // Follow the feed only if the player was already at the bottom; reading scrollback shouldn't be interrupted
            if (this.wasAtBottom) {
                this.scrollToBottom();
            }
        }
        this.playHead();
    }

    componentWillUnmount() {
        this.resizeObserver.disconnect();
        // Cancel any in-flight sequence timers. Without this, a sequence still printing when the app swaps to
        // the game-over or error screen keeps dispatching into the dead game. The head entry stays queued
        // with its progress, so a remount resumes it.
        this.pendingTimeouts.forEach(id => clearTimeout(id));
        this.pendingTimeouts.clear();
    }

    // All timers must go through this helper so componentWillUnmount can cancel them
    scheduleTimeout(fn, delay) {
        const id = setTimeout(() => {
            this.pendingTimeouts.delete(id);
            fn();
        }, delay);
        this.pendingTimeouts.add(id);
    }

    // Starts playing the head of the queue, unless it is already playing or was just finished (store
    // notifications are debounced, so props can still show a finished head for a tick).
    playHead() {
        const head = this.props.queue[0];
        if (!head || head.id === this.playingId || head.id === this.finishedId) { return; }
        this.playingId = head.id;

        if ('text' in head) {
            this.playText(head);
        }
        else {
            this.playSequence(head);
        }
    }

    finish(head, onFinish) {
        batch(() => {
            if (onFinish) { onFinish(this.props.dispatch); }
            this.props.dispatch(finishHead(head.id));
        });
        this.finishedId = head.id;
        this.playingId = null;
    }

    // One-off text (logInline): lands at once. log-inline spaces it a blank line's worth from what precedes it
    // (scripted sequences handle their own spacing with leading blank lines).
    playText(head) {
        const className = ['log-inline', head.className].filter(Boolean).join(' ');
        batch(() => {
            this.props.dispatch(printLine(head.text, { className, style: head.style }));
            this.finish(head, null);
        });
    }

    playSequence(head) {
        const record = database[head.sequence];
        const dispatch = this.props.dispatch;
        const lines = record.text.map(normalizeLine);
        let i = head.progress; // resumes where a reload left off

        const printNextLine = () => {
            if (i >= lines.length) {
                this.finish(head, record.onFinish);
                return;
            }

            const line = lines[i];
            const content = interpolate(line.text, head.vars);
            const typing = line.mode === 'chars' && content;
            const frames = line.mode === 'frames' && line.frames && line.frames.length ? line.frames : null;

            // Committed in full now; the animation below only changes what is drawn until the line lands
            const lineId = dispatch(printLine(content, {
                className: line.className, style: line.style, flash: !!(line.flash && content)
            }));
            i++;

            const land = () => {
                this.setState({ partial: null });
                // Sound lands with the flash: a flashed line plays logFlash by default; `sound` names another clip
                // for any line, or false to flash silently
                const sound = line.sound !== undefined ? line.sound : (line.flash && content ? 'logFlash' : false);
                if (sound) { playSfx(sound); }
                this.scheduleTimeout(printNextLine, (line.delay || 0) / LOG_SPEED);
            };

            if (typing) {
                const charDelay = (line.charDelay || DEFAULT_CHAR_DELAY) / LOG_SPEED;
                const tick = charDelay >= MIN_TICK_CHAR_DELAY;
                let shown = 0;
                const typeNextChar = () => {
                    shown++;
                    // One tick per visible character (spaces are silent); the setting is read live so a toggle
                    // mid-line takes effect at once
                    if (tick && this.props.typingSoundEnabled && content[shown - 1] !== ' ') { playSfx('logTypingTick'); }
                    if (shown < content.length) {
                        this.setState({ partial: { id: lineId, text: content.slice(0, shown) } });
                        this.scheduleTimeout(typeNextChar, charDelay);
                    }
                    else {
                        land();
                    }
                };
                this.setState({ partial: { id: lineId, text: '' } });
                typeNextChar();
            }
            else if (frames) {
                const frameDelay = (line.frameDelay || DEFAULT_FRAME_DELAY) / LOG_SPEED;
                let shown = 0;
                const showNextFrame = () => {
                    // One tick per advance (the first frame is the starting state, the final text is the last
                    // advance); shares the typing-sound switch, both are "the machine working"
                    if (shown > 0 && this.props.typingSoundEnabled) { playSfx('logProgressTick'); }
                    if (shown < frames.length) {
                        this.setState({ partial: { id: lineId, text: interpolate(frames[shown], head.vars) } });
                        shown++;
                        this.scheduleTimeout(showNextFrame, frameDelay);
                    }
                    else {
                        land();
                    }
                };
                showNextFrame();
            }
            else {
                land();
            }
        };

        printNextLine();
    }

    scrollToBottom() {
        this.jumpToBottom();

        // OverlayScrollbars may not have observed the new content yet when this runs; a stale scrollHeight
        // leaves the newest line just below the fold. Jump again on the next frame, after its size recalculation.
        requestAnimationFrame(() => this.jumpToBottom());
    }

    jumpToBottom() {
        if (this.logRef.current) {
            let osInstance = this.logRef.current.osInstance();

            if (osInstance) {
                osInstance.update(); // force a content-size recalculation before measuring
                const { scrollOffsetElement } = osInstance.elements();
                scrollOffsetElement.scrollTop = scrollOffsetElement.scrollHeight - scrollOffsetElement.clientHeight;
            }
        }
    }

    // Runs on every scroll (including our own jumpToBottom calls, which re-mark it true)
    trackScrollPosition(osInstance) {
        const { scrollOffsetElement } = osInstance.elements();
        const distanceFromBottom = scrollOffsetElement.scrollHeight
            - (scrollOffsetElement.scrollTop + scrollOffsetElement.clientHeight);
        this.wasAtBottom = distanceFromBottom <= 4; // small tolerance; scrollTop can be fractional
    }

    renderLine(line) {
        const partial = this.state.partial;
        const animating = partial && partial.id === line.id;
        const text = animating ? partial.text : line.text;

        const classes = [line.className];
        if (line.id >= this.sessionStartId) {
            classes.push(animating ? 'arriving' : 'landed');
            if (line.flash) { classes.push('flash'); }
        }

        // An explicit colour (terrain notes in their zone's map colour) replaces both ends of the settle
        // animation rather than being overridden by it
        let style = line.style || undefined;
        if (style && style.color) {
            const { color, ...rest } = style;
            style = { ...rest, '--fresh': color, '--rest': color };
        }

        return <p key={line.id} className={classes.filter(Boolean).join(' ') || undefined} style={style}>{text}</p>;
    }

    render() {
        return (
            <div className={`log-container ${this.props.visible ? '' : 'invisible'}`}>
                <div className="component-header">Terminal</div>

                <OverlayScrollbarsComponent className="log" ref={this.logRef} defer
                                            events={{ scroll: (instance) => this.trackScrollPosition(instance) }}>
                    {this.props.lines.map(line => this.renderLine(line))}
                </OverlayScrollbarsComponent>
                <div className="log-gradient"/>
            </div>
        );
    }
}

const mapStateToProps = state => {
    return {
        visible: state.game.showTerminal,
        lines: state.log.lines,
        queue: state.log.queue,
        nextId: state.log.nextId, // only read at mount, to tell restored lines from this session's
        typingSoundEnabled: state.game.typingSoundEnabled
    }
};

export default connect(
    mapStateToProps,
    null // Intentionally null so `dispatch` is passed as a prop for the sequence callbacks
)(Log);
