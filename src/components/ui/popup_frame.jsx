import React from 'react';

/**
 * Shared presentational chrome for popups: a dimming backdrop plus the popup surface (dark slab, a
 * header row in the side panels' style with the title and, when onClose is given, a ✕). The header takes
 * `accent` as its color when given (the encounter popup passes the site's map color), the panels' cyan
 * otherwise. Purely visual — positioning
 * comes from the caller's className/stylesheet, and all behavior (what opens it, what closes it,
 * what the body is) stays with the caller. Used by the encounter popup (anchored in the planet
 * frame) and the special panels (viewport-centered inside .panel-overlay).
 *
 * The backdrop is a sibling rendered before the surface, absolutely filling the nearest positioned
 * ancestor — so it dims whatever frame the caller mounts in. Styles in styles/components/popup.scss.
 */
export default function PopupFrame({ title, accent, className = '', style, onClose, onBackdropClick, children }) {
    return (
        <React.Fragment>
            <div className="popup-backdrop" onMouseDown={onBackdropClick}/>
            <div className={`popup-surface ${className}`} style={style}>
                {(title != null || onClose) &&
                    <div className="popup-title" style={accent ? { color: accent, borderColor: accent } : undefined}>
                        <span>{title}</span>
                        {onClose && <button className="popup-close" onClick={onClose}>✕</button>}
                    </div>}
                {children}
            </div>
        </React.Fragment>
    );
}
