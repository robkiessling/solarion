import React from 'react';
import {batch, connect} from 'react-redux';
import database from '../database/logs';
import {endLogSequence, getLogData} from "../redux/modules/log";

const DEBUG = false;

const DEFAULT_CHAR_DELAY = 30; // ms per character in 'chars' mode

// Database lines come in two shapes: the legacy tuple [text, delayAfterMs, flash] and an options
// object { text, delay, flash, className, style, mode: 'chars', charDelay }.
function normalizeLine(line) {
    return Array.isArray(line) ? { text: line[0], delay: line[1], flash: line[2] } : line;
}

// Fills {placeholders} from the vars stored on the log entry (see startLogSequence). Unknown
// placeholders are left as-is so a typo is visible rather than silently blank.
function interpolate(text, vars) {
    if (!vars) { return text; }
    return text.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

class LogSection extends React.Component {
    constructor(props) {
        super(props);

        this.logSectionRef = React.createRef();
        this.pendingTimeouts = new Set();
    }

    // All timers must go through this helper so componentWillUnmount can cancel them
    scheduleTimeout(fn, delay) {
        const id = setTimeout(() => {
            this.pendingTimeouts.delete(id);
            fn();
        }, delay);
        this.pendingTimeouts.add(id);
    }

    componentDidMount() {
        if (this.props.logData.entryType === 'inline') {
            this.renderInline();
            return;
        }

        const databaseRecord = database[this.props.logData.id]

        if (this.props.logData.status === 'completed') {
            this.backfillSequence(databaseRecord);
        }
        else {
            this.logSequence(databaseRecord);
        }
    }

    // Inline entries carry their own text (dynamic content like expedition reports); always rendered instantly
    renderInline() {
        const node = document.createElement('p');
        node.appendChild(document.createTextNode(this.props.logData.text));
        if (this.props.logData.className) {
            node.className = this.props.logData.className;
        }
        if (this.props.logData.style) {
            Object.assign(node.style, this.props.logData.style);
        }
        this.logSectionRef.current.appendChild(node);
        this.props.onUpdate();
    }

    componentWillUnmount() {
        // Cancel any in-flight sequence timers. Without this, a sequence still printing when the app
        // swaps to the game-over or error screen keeps dispatching endLogSequence/onFinish into the dead game.
        this.pendingTimeouts.forEach(id => clearTimeout(id));
        this.pendingTimeouts.clear();
    }

    // Builds the <p> for a line, with its full text already in place (backfill and non-animated lines)
    buildLineNode(line) {
        const node = this.buildEmptyLineNode(line);
        node.appendChild(document.createTextNode(interpolate(line.text, this.props.logData.vars)));
        return node;
    }

    buildEmptyLineNode(line) {
        const node = document.createElement('p');
        if (line.className) { node.className = line.className; }
        if (line.style) { Object.assign(node.style, line.style); }
        return node;
    }

    // Just displaying it for historical purposes; skipping all callbacks and animation
    backfillSequence(databaseRecord) {
        const logSection = this.logSectionRef.current;

        databaseRecord.text.forEach((rawLine) => {
            logSection.appendChild(this.buildLineNode(normalizeLine(rawLine)));
        });

        this.props.onUpdate();
    }

    logSequence(databaseRecord) {
        const logSection = this.logSectionRef.current;
        const dispatch = this.props.dispatch;

        const text = databaseRecord.text;
        let i = 0, len = text.length;

        const finishSequence = (delay) => {
            this.scheduleTimeout(() => {
                batch(() => {
                    if (databaseRecord.onFinish) { databaseRecord.onFinish(dispatch); }
                    dispatch(endLogSequence(this.props.logData.sequence));
                })
            }, delay);
        };

        if (len === 0) {
            finishSequence(0);
            return;
        }

        const printNextLine = (delay) => {
            this.scheduleTimeout(() => {
                const line = normalizeLine(text[i]);
                const content = interpolate(line.text, this.props.logData.vars);
                const typing = line.mode === 'chars' && content;

                const node = typing ? this.buildEmptyLineNode(line) : this.buildLineNode(line);

                if (line.flash && content) {
                    node.classList.add('flash');
                    this.scheduleTimeout(() => {
                        node.classList.add('fade-flash');
                    }, 250)
                }

                logSection.appendChild(node);
                this.props.onUpdate();

                const advance = () => {
                    let nextDelay = line.delay;
                    if (DEBUG) { nextDelay /= 10; } // makes the log go 10x faster

                    i++;
                    if (i < len) {
                        printNextLine(nextDelay);
                    }
                    else {
                        finishSequence(nextDelay);
                    }
                };

                if (typing) {
                    let shown = 0;
                    let charDelay = line.charDelay || DEFAULT_CHAR_DELAY;
                    if (DEBUG) { charDelay /= 10; }

                    const typeNextChar = () => {
                        shown++;
                        node.textContent = content.slice(0, shown);
                        if (shown < content.length) {
                            this.scheduleTimeout(typeNextChar, charDelay);
                        }
                        else {
                            this.props.onUpdate(); // the line may have wrapped while typing
                            advance();
                        }
                    };
                    typeNextChar();
                }
                else {
                    advance();
                }
            }, delay);
        }

        printNextLine(0);
    }

    render() {
        const inlineClass = this.props.logData.entryType === 'inline' ? 'log-inline' : '';
        return (
            <div className={`log-section ${inlineClass} ${this.props.active ? 'active' : 'inactive'}`} ref={this.logSectionRef}/>
        );
    }
}

const mapStateToProps = (state, ownProps) => {
    const logData = getLogData(state.log, ownProps.sequenceId);

    return {
        logData: logData
    }
};

export default connect(
    mapStateToProps,
    null // Intentionally null so we can manually pass `dispatch` to certain functions
)(LogSection);
