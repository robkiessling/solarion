import _ from 'lodash';
import React from 'react';
import {connect} from "react-redux";
import ResourceAmounts from "../ui/resource_amounts";
import {CHASSIS_PANEL, CHASSIS_ROWS, STAT_LABELS} from "../../database/chassis";
import {authorizeChassis, canAuthorizeChassis, getAuthorizedRecord, isChassisRowUnlocked} from "../../redux/modules/panels";
import {highlightCosts} from "../../redux/modules/resources";
import 'overlayscrollbars/styles/overlayscrollbars.css';
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";

/**
 * The droid factory's schematic index: the chassis design corpus rendered as the AI's index
 * printout. Every row is visible from day one — locked rows show as corruption bars with a
 * truthful source hint (the "shell"). Authorized rows collapse to one line with their
 * authorization number; a fork's declined variant stays greyed beneath with a RETOOL button.
 * Rows flagged postIndex render below "END OF INDEX", unnumbered (the AI's own late designs).
 * Content lives in database/chassis.js; state in redux/modules/panels.js.
 */

// One "hull +3" / "attack +50%" line per operation in an option's effect. Improvements read
// green: bigger is better unless the stat is inverted (e.g. swing time — lower is faster).
function statLines(effect) {
    const lines = [];
    Object.entries(effect || {}).forEach(([variable, operations]) => {
        const stat = STAT_LABELS[variable] || { label: variable };
        Object.entries(operations).forEach(([operation, value]) => {
            let text, good;
            if (operation === 'multiply') {
                const pct = Math.round((value - 1) * 100);
                text = `${pct > 0 ? '+' : ''}${pct}%`;
                good = stat.invert ? value < 1 : value > 1;
            }
            else {
                text = `${value > 0 ? '+' : ''}${value}`;
                good = stat.invert ? value < 0 : value > 0;
            }
            lines.push({ label: stat.label, text, good });
        });
    });
    return lines;
}

class SchematicIndex extends React.Component {
    renderOptionCard(row, option) {
        const retoolingThis = row.retooling && row.retooling.optionId === option.db.id;
        const isRetool = !!row.authorized && !option.isActive;
        let buttonText = isRetool ? 'RETOOL' : 'AUTHORIZE';
        if (retoolingThis) {
            const pct = Math.max(0, Math.min(100, Math.round((1 - row.retooling.remainingMs / row.retooling.totalMs) * 100)));
            buttonText = `RETOOLING… ${pct}%`;
        }
        const cardClass = option.isActive ? 'active' : (isRetool && !retoolingThis ? 'declined' : '');

        return (
            <div key={option.db.id} className={`option-card ${cardClass}`}>
                <div className="option-name">{option.db.name}</div>
                {statLines(option.db.effect).map((line, i) =>
                    <div key={i} className="stat-line">
                        <span>{line.label}</span>
                        <span className={line.good ? 'stat-good' : 'stat-bad'}>{line.text}</span>
                    </div>
                )}
                {option.db.note &&
                    <div className="margin-note">— {option.db.note.author}: “{option.db.note.text}”</div>}
                {!_.isEmpty(option.db.cost) &&
                    <div className="option-cost">Cost: <ResourceAmounts amounts={option.cost}/></div>}
                {option.db.downtime > 0 &&
                    <div className="option-cost">Retool time: {option.db.downtime}s</div>}
                {option.isActive
                    ? <div className="active-badge">ACTIVE — AUTHORIZATION #{row.authorized.authNumber}</div>
                    : <button className="authorize"
                              disabled={!option.canAuthorize || retoolingThis}
                              onClick={() => this.props.authorizeChassis(row.db.id, option.db.id)}>
                        [ {buttonText} ]
                    </button>}
            </div>
        );
    }

    renderRow(row, number) {
        const numberText = row.db.postIndex ? '——' : String(number).padStart(2, '0');

        // Locked: a corrupted index entry plus whatever the machine truthfully knows about it
        if (!row.unlocked) {
            return (
                <div key={row.db.id} className="index-row locked">
                    <div className="row-line">
                        <span className="row-num">{numberText}</span>
                        <span className="row-marker">▪</span>
                        <span className="row-corrupted">{row.db.corrupted || '████████'} [DATA CORRUPTED]</span>
                    </div>
                    {row.db.sourceHint && <div className="row-sub">{row.db.sourceHint}</div>}
                </div>
            );
        }

        const activeOption = row.authorized &&
            row.db.options.find(option => option.id === row.authorized.optionId);
        const titleName = activeOption ? activeOption.name : row.db.name;
        const subline = [row.db.blurb, row.db.author].filter(Boolean).join(' · ');
        // Forks stay open forever (active side marked, declined side offers RETOOL — a standing
        // choice needs its comparison on the page); singles collapse to their ledger line once signed
        const cards = (row.db.kind === 'fork' ? row.options : row.options.filter(option => !option.isActive))
            .filter(option => option.db.id);

        return (
            <div key={row.db.id} className={`index-row ${row.db.postIndex ? 'post-index' : ''}`}>
                <div className="row-line">
                    <span className="row-num">{numberText}</span>
                    <span className="row-marker">{row.authorized ? '▸' : '▾'}</span>
                    <span className="row-name">{titleName}{!row.authorized && row.db.kind === 'fork' ? ' — SELECT VARIANT' : ''}</span>
                    {row.authorized && <span className="row-auth">AUTHORIZED #{row.authorized.authNumber}</span>}
                </div>
                {subline && <div className="row-sub">{subline}</div>}
                {cards.length > 0 &&
                    <div className="option-cards">
                        {cards.map(option => this.renderOptionCard(row, option))}
                    </div>}
            </div>
        );
    }

    render() {
        const indexRows = this.props.rows.filter(row => !row.db.postIndex);
        // Post-index rows exist only once granted — they were never in the human index
        const postIndexRows = this.props.rows.filter(row => row.db.postIndex && row.unlocked);

        return (
            // Header stays put; only the rows scroll (custom scrollbar, per the panel layout contract)
            <div className="schematic-index">
                <div className="index-header">
                    <div>{CHASSIS_PANEL.corpusHeader}</div>
                    <div className="index-counts">
                        INDEX: {indexRows.length} ENTRIES
                        {' · '}RECOVERED: {indexRows.filter(row => row.unlocked).length}
                        {' · '}AUTHORIZED: {this.props.rows.filter(row => row.authorized).length}
                    </div>
                </div>
                <OverlayScrollbarsComponent className="index-scroll" defer>
                    <div className="index-rows">
                        {indexRows.map((row, i) => this.renderRow(row, i + 1))}
                        <div className="index-end">── END OF INDEX ──</div>
                        {postIndexRows.map(row => this.renderRow(row, 0))}
                    </div>
                </OverlayScrollbarsComponent>
            </div>
        );
    }
}

const mapStateToProps = (state) => {
    const retoolingState = state.panels.chassis.retooling;

    return {
        rows: CHASSIS_ROWS.map(row => {
            const authorized = getAuthorizedRecord(state.panels, row);
            return {
                db: row,
                unlocked: isChassisRowUnlocked(state.panels, row),
                authorized,
                retooling: retoolingState && retoolingState.rowId === row.id ? retoolingState : null,
                options: row.options.map(option => ({
                    db: option,
                    isActive: !!(authorized && authorized.optionId === option.id),
                    canAuthorize: canAuthorizeChassis(state, row.id, option.id),
                    cost: option.cost ? highlightCosts(state.resources, option.cost) : null,
                })),
            };
        }),
    };
};

export default connect(
    mapStateToProps,
    { authorizeChassis }
)(SchematicIndex);
