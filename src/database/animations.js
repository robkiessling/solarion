import {mod} from "../lib/helpers";

const base = {
    style: {},
    idle: {
        ascii: [
            'TBD'
        ]
    }
}

// export const UNKNOWN_IMAGE = {
//     ascii: [
//         '   _   ',
//         '.´   ` ',
//         '      )',
//         '    .´ ',
//         '   |   ',
//         '       ',
//         '   °   ',
//     ]
// }


class Frame {
    constructor(charArray, color = '#fff', duration = 1) {
        this.charArray = charArray;
        this.color = color;
        this.duration = duration;
    }

    getFrame() {
        return this;
    }

    toDisplay() {
        return this.charArray;
    }

    height() {
        return this.charArray.length
    }
}

// repeats a frame in the desired direction
// e.g. [['x','y']] repeated 3 times would be [['x','y'],['x','y'],['x','y']]
// note: only extending in the vertical direction is currently supported
class LargerFrame extends Frame {
    constructor(charArray, magnitude, color = '#fff', duration = 1) {
        const newCharArray = [];
        for (let i = 0; i < magnitude; i++) {
            charArray.forEach(row => {
                newCharArray.push(row);
            })
        }
        super(newCharArray, color, duration);
    }
}

class Animation {
    constructor(options, frames) {
        this.fps = options.fps;
        this.randomFps = options.randomFps;
        this.identical = options.identical;

        this.frames = this._unfoldFrames(frames);
    }

    _unfoldFrames(frames) {
        const result = [];
        frames.forEach(frame => {
            for (let i = 0; i < frame.duration; i++) {
                result.push(frame);
            }
        })
        return result;
    }

    getFrame(elapsedTime, animationDelay) {
        if (this.identical) { animationDelay = 0; }

        const fps = this.fps || this.randomFps[Math.floor(animationDelay * this.randomFps.length)]
        if (!fps) { return this.frames[0]; }

        const frameDuration = 1 / fps;
        const animationDuration = this.frames.length * frameDuration;
        const randomOffset = animationDelay * animationDuration;
        const timeIntoAnimation = mod(elapsedTime + randomOffset, animationDuration);
        return this.frames[Math.floor(timeIntoAnimation / frameDuration)];
    }
}

class RandomAnimation extends Animation {
    getFrame(elapsedTime, animationDelay) {
        return this.frames[Math.floor(animationDelay * this.frames.length)];
    }
}

// Given a single frame, will animate it by looping the image as if it were on a roll.
// i.e. for each frame, it shifts all the rows down 1, and loops the lowest row back to the top
// Note: Only the downward direction is currently supported, but it wouldn't be too hard to implement others
class LoopingAnimation extends Animation {
    constructor(options, exampleFrame) {
        const frames = [];

        let charArray = exampleFrame.charArray.slice(0);

        for (let i = 0; i < exampleFrame.height(); i++) {
            frames.push(new Frame(charArray, exampleFrame.color));

            charArray = charArray.slice(0); // duplicate the charArray for the next frame
            charArray.unshift(charArray.pop()); // rotate it downward
        }

        super(options, frames);
    }

}

export const doodads = {
    vent: {
        idle: new Frame([
            '      __ __..__,_    ',
            '   ,.¯  V        `,  ',
            '  |`-___.___.--v.-:\\ ',
            ' :     ·     \\     \\\\',
            '/     /       :     \\',
        ], '#f9903c')
    },
    rock1: {
        idle: new Frame([
            '              _      ',
            '             / \\     ',
            '      _|\\ .-\'\\  \\_   ',
            '     :   V    -   :  ',
            '  _./  :  ~    =   \\ ',
            './    /    \\        |',
        ], '#f9903c')
    },
    rock2: {
        idle: new Frame([
            '     _          ',
            '   _·\\¯\\    _   ',
            '../   ¯\\¯-=/ ¯\\_',
        ], '#f9903c')
    },
    rock3: {
        idle: new Frame([
            '      __ _     ',
            ' ,-..-    \\__. ',
            '.             \\',
        ], '#f9903c')
    },
    rock4: {
        idle: new Frame([
            '       _   ',
            '__,.-`` \\__',
        ], '#f9903c')
    },
    laserBeam1: {
        idle: new LoopingAnimation(
            { fps: 15 },
            new LargerFrame([
                '|',
                'V',
                '|',
                'v',
                'V',
                '!',
                '|',
                '#',
                '|',
                'V'
            ], 2, 'yellow')
        )
    },
    laserBeam2: {
        idle: new LoopingAnimation(
            { fps: 15 },
            new LargerFrame([
                '||',
                'Vv',
                '|V',
                'vv',
                'V|',
                '!|',
                '||',
                '#V',
                '||',
                'V|'
            ], 3, 'yellow')
        )
    },
    laserBeam6: {
        idle: new LoopingAnimation(
            { fps: 15 },
            new LargerFrame([
                '|v|v||',
                'V|V|#v',
                '|!|VV|',
                'vv|||v',
                'V|!V||',
                '!v$|v|',
                '||||V|',
                '#|!!|V',
                '||||||',
                'V|v|V|'
            ], 4, 'yellow')
        )
    },
    laserBeam10: {
        idle: new LoopingAnimation(
            { fps: 15 },
            new LargerFrame([
                '|v|!|v|v||',
                'Vv||||V|#v',
                '|v|V+!|VV|',
                'v||V|v|||v',
                'V*||||!V||',
                '!*!V|v$|v|',
                '||$|V|||V|',
                '#|v|||!!|V',
                '||v|||||||',
                'V|v|v|v|V|'
            ], 5, 'yellow')
        )
    },
    laserBeam14: {
        idle: new LoopingAnimation(
            { fps: 15 },
            new LargerFrame([
                '|||v|||v||',
                'V$Vv||V|#v',
                '||!v|v|VV|',
                'v|#||V|||v',
                'V||*|V!V||',
                '!||*!|$|v|',
                '|V||$V||V|',
                '#|v|vV!!|V',
                '||V|vV||||',
                'V|||v|v|V|'
            ], 6, 'yellow')
        )
    },
    laserBeam60: {
        idle: new LoopingAnimation(
            { fps: 15 },
            new LargerFrame([
                '|||v|||v|||||v|||v|||||v|||v|||||v|||v|||||v|||v|||||v|||v||||',
                'V$Vv||V|#vV$Vv||V|#vV$Vv||V|#vV$Vv||V|#vV$Vv||V|#vV$Vv||V|#vV$',
                '||!v|v|VV|||!v|v|VV|||!v|v|VV|||!v|v|VV|||!v|v|VV|||!v|v|VV|||',
                'v|#||V|||vv|#||V|||vv|#||V|||vv|#||V|||vv|#||V|||vv|#||V|||vv|',
                'V||*|V!V||V||*|V!V||V||*|V!V||V||*|V!V||V||*|V!V||V||*|V!V||V|',
                '!||*!|$|v|!||*!|$|v|!||*!|$|v|!||*!|$|v|!||*!|$|v|!||*!|$|v|!|',
                '|V||$V||V||V||$V||V||V||$V||V||V||$V||V||V||$V||V||V||$V||V||V',
                '#|v|vV!!|V#|v|vV!!|V#|v|vV!!|V#|v|vV!!|V#|v|vV!!|V#|v|vV!!|V#|',
                '||V|vV||||||V|vV||||||V|vV||||||V|vV||||||V|vV||||||V|vV||||||',
                'V|||v|v|V|V|||v|v|V|V|||v|v|V|V|||v|v|V|V|||v|v|V|V|||v|v|V|V|'
            ], 6, 'yellow')
        )
    },
}


const WIND_TURBINE_FRAMES = [
    new Frame([
        '     / ',
        '    /  ',
        '---OD  ',
        '    \\  ',
        '    ║\\ ',
        '    ║  ',
        '    ║  ',
    ]),
    new Frame([
        '   |   ',
        '   |   ',
        '   O---',
        '  / ║  ',
        ' /  ║  ',
        '    ║  ',
        '    ║  ',
    ]),
    new Frame([
        ' \\   / ',
        '  \\ /  ',
        '   OD  ',
        '   |║  ',
        '   |║  ',
        '    ║  ',
        '    ║  ',
    ]),
    new Frame([
        '   |   ',
        '   |   ',
        '---OD  ',
        '    \\  ',
        '    ║\\ ',
        '    ║  ',
        '    ║  ',
    ]),
    new Frame([
        ' \\     ',
        '  \\    ',
        '   O---',
        '  / ║  ',
        ' /  ║  ',
        '    ║  ',
        '    ║  ',
    ]),
    new Frame([
        '     / ',
        '    /  ',
        '---OD  ',
        '   |║  ',
        '   |║  ',
        '    ║  ',
        '    ║  ',
    ]),
    new Frame([
        '   |   ',
        '   |   ',
        '   OD  ',
        '  / \\  ',
        ' /  ║\\ ',
        '    ║  ',
        '    ║  ',
    ]),
    new Frame([
        ' \\     ',
        '  \\    ',
        '   O---',
        '   |║  ',
        '   |║  ',
        '    ║  ',
        '    ║  ',
    ])
]


/**
 * Format:
 *
 * animationId: {
 *     animationTag: Frame/Animation
 * }
 *
 */
export const structures = {
    harvester: {
        idle: new Frame([
            '          | ',
            ' TTT8>//==║ ',
            '/____|_|  ║ ',
            'oo oo oo  V ',
        ]),
        running: new Animation({fps: 4}, [
            new Frame([
                '          | ',
                ' TTT8>//==║ ',
                '/____|_|  ║ ',
                'oo oo oo `║,',
            ]),
            new Frame([
                '          | ',
                ' TTT8>//==║ ',
                '/____|_|  ║ ',
                'oo oo oo .║\'',
            ]),
            new Frame([
                '          | ',
                ' TTT8>//==║ ',
                '/____|_|  ║ ',
                'oo oo oo \\║,',
            ]),
            new Frame([
                '          | ',
                ' TTT8>//==║ ',
                '/____|_|  ║ ',
                'oo oo oo .║;',
            ])
        ])
    },
    harvester2: {
        idle: new Frame([
            ' |          ',
            ' ║==\\\\<8TTT ',
            ' ║  |_|____\\',
            ' V  oo oo oo',
        ]),
        running: new Animation({fps: 4}, [
            new Frame([
                ' |          ',
                ' ║==\\\\<8TTT ',
                ' ║  |_|____\\',
                '\\║\' oo oo oo',
            ]),
            new Frame([
                ' |          ',
                ' ║==\\\\<8TTT ',
                ' ║  |_|____\\',
                '`║. oo oo oo',
            ]),
            new Frame([
                ' |          ',
                ' ║==\\\\<8TTT ',
                ' ║  |_|____\\',
                '.║/ oo oo oo',
            ]),
            new Frame([
                ' |          ',
                ' ║==\\\\<8TTT ',
                ' ║  |_|____\\',
                '`║, oo oo oo',
            ])
        ])
    },
    solarPanel: {
        idle: new Frame([
            // ' _ _ _ _    ',
            // ' \\_\\_\\_\\_\\  ',
            // ' /\\_\\_\\_\\_\\ ',
            // '/I¯\\_\\_\\_\\_\\',
            '_ _ _ _ _',
            '\\_\\_\\_\\_\\_\\',
            '/\\_\\_\\_\\_\\_\\',
        ])
    },
    windTurbine: {
        // when idle, we use a random animation frame so they don't all look frozen at the exact same spot
        idle: new RandomAnimation({},
            WIND_TURBINE_FRAMES
        ),
        running: new Animation({randomFps: [1, 0.8, 1.2, 0.75, 0.5, 1.3]},
            WIND_TURBINE_FRAMES
        )
    },

    // todo thermal vent

    energyBay: {
        idle: new Animation({fps: 8, identical: false}, [
            new Frame([
                '  ______  ',
                ' ||-|-|-| ',
                ' ||_____| ',
                '/__\\ ___ \\',
            ], '#fff', 20),
            new Frame([
                '  ______  ',
                ' ||=|-|-| ',
                ' ||_____| ',
                '/__\\ ___ \\',
            ]),
            new Frame([
                '  ______  ',
                ' ||-|=|-| ',
                ' ||_____| ',
                '/__\\ ___ \\',
            ]),
            new Frame([
                '  ______  ',
                ' ||-|-|=| ',
                ' ||_____| ',
                '/__\\ ___ \\',
            ]),
            new Frame([
                '  ______  ',
                ' ||-|=|-| ',
                ' ||_____| ',
                '/__\\ ___ \\',
            ]),
            new Frame([
                '  ______  ',
                ' ||=|-|-| ',
                ' ||_____| ',
                '/__\\ ___ \\',
            ]),
            new Frame([
                '  ______  ',
                ' ||-|=|-| ',
                ' ||_____| ',
                '/__\\ ___ \\',
            ]),
            new Frame([
                '  ______  ',
                ' ||-|-|=| ',
                ' ||_____| ',
                '/__\\ ___ \\',
            ]),
        ])
    },

    refinery: {
        idle: new Frame([
            '             ',
            '             ',
            '             ',
            '             ',
            '             ',
            ' .         TT',
            ' |   _     ║║',
            ' ║===|====]║║[',
            ' ║===|====]║║[',
            '/    /   /____\\',
        ]),
        running: new Animation({ fps: 4 }, [
            new Frame([
                '             ',
                '             ',
                '             ',
                '             ',
                '             ',
                ' .         TT',
                ' |   _     ║║',
                ' ║===|====]║║[',
                ' ║===|====]║║[',
                '/    /   /____\\',
            ]),
            // new Frame([
            //     '             ',
            //     '             ',
            //     '             ',
            //     '             ',
            //     '           -=',
            //     ' .         TT',
            //     ' |   _     ║║',
            //     ' ║===|====]║║[',
            //     ' ║===|====]║║[',
            //     '/    /   /____\\',
            // ]),
            // new Frame([
            //     '             ',
            //     '             ',
            //     '             ',
            //     '            =≡',
            //     '           =-',
            //     ' .         TT',
            //     ' |   _     ║║',
            //     ' ║===|====]║║[',
            //     ' ║===|====]║║[',
            //     '/    /   /____\\',
            // ]),
            // new Frame([
            //     '             ',
            //     '             ',
            //     '             _=-',
            //     '            -= ',
            //     '           -=',
            //     ' .         TT',
            //     ' |   _     ║║',
            //     ' ║===|====]║║[',
            //     ' ║===|====]║║[',
            //     '/    /   /____\\',
            // ]),
            // new Frame([
            //     '             ',
            //     '              =-≡¯',
            //     '             ¯-=',
            //     '            -¯',
            //     '            -',
            //     ' .         TT',
            //     ' |   _     ║║',
            //     ' ║===|====]║║[',
            //     ' ║===|====]║║[',
            //     '/    /   /____\\',
            // ]),
            // new Frame([
            //     '                   _',
            //     '               ¯=¯=',
            //     '              =¯',
            //     '             -',
            //     '             ',
            //     ' .         TT',
            //     ' |   _     ║║',
            //     ' ║===|====]║║[',
            //     ' ║===|====]║║[',
            //     '/    /   /____\\',
            // ]),
            // new Frame([
            //     '                  -',
            //     '               _≡¯',
            //     '              -¯',
            //     '             ',
            //     '             ',
            //     ' .         TT',
            //     ' |   _     ║║',
            //     ' ║===|====]║║[',
            //     ' ║===|====]║║[',
            //     '/    /   /____\\',
            // ]),
            // new Frame([
            //     '                 _=¯',
            //     '                ¯',
            //     '             ',
            //     '             ',
            //     '             ',
            //     ' .         TT',
            //     ' |   _     ║║',
            //     ' ║===|====]║║[',
            //     ' ║===|====]║║[',
            //     '/    /   /____\\',
            // ]),
            // new Frame([
            //     '                  ¯',
            //     '             ',
            //     '             ',
            //     '             ',
            //     '             ',
            //     ' .         TT',
            //     ' |   _     ║║',
            //     ' ║===|====]║║[',
            //     ' ║===|====]║║[',
            //     '/    /   /____\\',
            // ]),


            new Frame([
                '             ',
                '             ',
                '             ',
                '             ',
                '           =-',
                ' .         TT',
                ' |   _     ║║',
                ' ║===|====]║║[',
                ' ║===|====]║║[',
                '/    /   /____\\',
            ]),
            new Frame([
                '             ',
                '             ',
                '             ',
                '          ≡= ',
                '           -=',
                ' .         TT',
                ' |   _     ║║',
                ' ║===|====]║║[',
                ' ║===|====]║║[',
                '/    /   /____\\',
            ]),
            new Frame([
                '             ',
                '             ',
                '        -=_  ',
                '          =- ',
                '           =-',
                ' .         TT',
                ' |   _     ║║',
                ' ║===|====]║║[',
                ' ║===|====]║║[',
                '/    /   /____\\',
            ]),
            new Frame([
                '             ',
                '      ¯≡-=   ',
                '        =-¯  ',
                '          ¯- ',
                '           -_',
                ' .         TT',
                ' |   _     ║║',
                ' ║===|====]║║[',
                ' ║===|====]║║[',
                '/    /   /____\\',
            ]),
            new Frame([
                '     _      ',
                '      =¯=¯   ',
                '        ¯=   ',
                '          -  ',
                '             ',
                ' .         TT',
                ' |   _     ║║',
                ' ║===|====]║║[',
                ' ║===|====]║║[',
                '/    /   /____\\',
            ]),
            new Frame([
                '     -      ',
                '      ¯≡_   ',
                '        ¯-   ',
                '             ',
                '             ',
                ' .         TT',
                ' |   _     ║║',
                ' ║===|====]║║[',
                ' ║===|====]║║[',
                '/    /   /____\\',
            ]),
            new Frame([
                '    ¯=_      ',
                '       ¯     ',
                '             ',
                '             ',
                '             ',
                ' .         TT',
                ' |   _     ║║',
                ' ║===|====]║║[',
                ' ║===|====]║║[',
                '/    /   /____\\',
            ]),
            new Frame([
                '     ¯       ',
                '             ',
                '             ',
                '             ',
                '             ',
                ' .         TT',
                ' |   _     ║║',
                ' ║===|====]║║[',
                ' ║===|====]║║[',
                '/    /   /____\\',
            ]),
            new Frame([
                '             ',
                '             ',
                '             ',
                '             ',
                '             ',
                ' .         TT',
                ' |   _     ║║',
                ' ║===|====]║║[',
                ' ║===|====]║║[',
                '/    /   /____\\',
            ], '#fff', 10),
        ])
    },

    droidFactory: {
        idle: new Animation({ fps: 1 }, [
            new Frame([
                '         ___',
                '        _|;|__',
                '  _____/ \\\\\\\\ \\\\',
                ' /__\\ \\==|  |==\\\\',
                '//  \\\\ \\_|__|__||',
                '[]__[] ] |  |   \\\\',
                '[///[] ]/ \\/ \\ ...]',
            ])
        ])
    },

    probeFactory: {
        idle: new Frame([
            '                                        ',
            '                                        ',
            '                                        ',
            '                                        ',
            '                                        ',
            '                                        ',
            '                                        ',
            '                                        ',
            '                                        ',
            '               ,                        ',
            '              . *,                      ',
            '              \\`. *,                    ',
            '               \\\\`. *,           _____  ',
            '              /¯T\\\\`. *,        /;#;\\\\\\ ',
            '             /_/T\\\\\\\\`. *,__,---|;#;||| ',
            '            |T|¯|/\\\\\\\\^`. 7 7 7 7777|7|\\',
        ]),
        running: new Animation({ fps: 20 }, [
            new Frame([
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '               ,                        ',
                '              . *,                      ',
                '              \\`. *,                    ',
                '               \\\\`. *,           _____  ',
                '              /¯T\\\\`. *,        /;#;\\\\\\ ',
                '             /_/T\\\\\\\\`. *,__,---|;#;||| ',
                '            |T|¯|/\\\\\\\\^`. 7 7 7 7777|7|\\',
            ]),
            new Frame([
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '               ,                        ',
                '              . *,                      ',
                '              \\`. *,                    ',
                '               \\\\`. *,           _____  ',
                '              /¯T\\\\`. *,        /;#;\\\\\\ ',
                '             /_/T\\\\\\\\`. *,__,---|;#;||| ',
                '            |T|¯|/\\\\\\\\^`. 7 7 7·7777|7|\\',
            ]),
            new Frame([
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '               ,                        ',
                '              . *,                      ',
                '              \\`. *,                    ',
                '               \\\\`. *,           _____  ',
                '              /¯T\\\\`. *,        /;#;\\\\\\ ',
                '             /_/T\\\\\\\\`. *,__,---|;#;||| ',
                '            |T|¯|/\\\\\\\\^`. 7 7·7 7777|7|\\',
            ]),
            new Frame([
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '               ,                        ',
                '              . *,                      ',
                '              \\`. *,                    ',
                '               \\\\`. *,           _____  ',
                '              /¯T\\\\`. *,        /;#;\\\\\\ ',
                '             /_/T\\\\\\\\`. *,__,---|;#;||| ',
                '            |T|¯|/\\\\\\\\^`. 7·7 7 7777|7|\\',
            ]),
            new Frame([
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '               ,                        ',
                '              . *,                      ',
                '              \\`. *,                    ',
                '               \\\\`. *,           _____  ',
                '              /¯T\\\\`. *,        /;#;\\\\\\ ',
                '             /_/T\\\\\\\\`. *,__,---|;#;||| ',
                '            |T|¯|/\\\\\\\\^`.·7 7 7 7777|7|\\',
            ]),
            new Frame([
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '               ,                        ',
                '              . *,                      ',
                '              \\`. *,                    ',
                '               \\\\`. *,           _____  ',
                '              /¯T\\\\`. *,        /;#;\\\\\\ ',
                '             /_/T\\\\\\\\`.·*,__,---|;#;||| ',
                '            |T|¯|/\\\\\\\\^`. 7 7 7 7777|7|\\',
            ]),
            new Frame([
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '               ,                        ',
                '              . *,                      ',
                '              \\`. *,                    ',
                '               \\\\`. *,           _____  ',
                '              /¯T\\\\`.·*,        /;#;\\\\\\ ',
                '             /_/T\\\\\\\\`. *,__,---|;#;||| ',
                '            |T|¯|/\\\\\\\\^`. 7 7 7 7777|7|\\',
            ]),
            new Frame([
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '               ,                        ',
                '              . *,                      ',
                '              \\`. *,                    ',
                '               \\\\`.·*,           _____  ',
                '              /¯T\\\\`. *,        /;#;\\\\\\ ',
                '             /_/T\\\\\\\\`. *,__,---|;#;||| ',
                '            |T|¯|/\\\\\\\\^`. 7 7 7 7777|7|\\',
            ]),
            new Frame([
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '               ,                        ',
                '              . *,                      ',
                '              \\`.·*,                    ',
                '               \\\\`. *,           _____  ',
                '              /¯T\\\\`. *,        /;#;\\\\\\ ',
                '             /_/T\\\\\\\\`. *,__,---|;#;||| ',
                '            |T|¯|/\\\\\\\\^`. 7 7 7 7777|7|\\',
            ]),
            new Frame([
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '               ,                        ',
                '              .·*,                      ',
                '              \\`. *,                    ',
                '               \\\\`. *,           _____  ',
                '              /¯T\\\\`. *,        /;#;\\\\\\ ',
                '             /_/T\\\\\\\\`. *,__,---|;#;||| ',
                '            |T|¯|/\\\\\\\\^`. 7 7 7 7777|7|\\',
            ]),
            new Frame([
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '             · ,                        ',
                '              . *,                      ',
                '              \\`. *,                    ',
                '               \\\\`. *,           _____  ',
                '              /¯T\\\\`. *,        /;#;\\\\\\ ',
                '             /_/T\\\\\\\\`. *,__,---|;#;||| ',
                '            |T|¯|/\\\\\\\\^`. 7 7 7 7777|7|\\',
            ]),
            new Frame([
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '         ·                              ',
                '                                        ',
                '               ,                        ',
                '              . *,                      ',
                '              \\`. *,                    ',
                '               \\\\`. *,           _____  ',
                '              /¯T\\\\`. *,        /;#;\\\\\\ ',
                '             /_/T\\\\\\\\`. *,__,---|;#;||| ',
                '            |T|¯|/\\\\\\\\^`. 7 7 7 7777|7|\\',
            ]),
            new Frame([
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '     ·                                  ',
                '                                        ',
                '                                        ',
                '                                        ',
                '               ,                        ',
                '              . *,                      ',
                '              \\`. *,                    ',
                '               \\\\`. *,           _____  ',
                '              /¯T\\\\`. *,        /;#;\\\\\\ ',
                '             /_/T\\\\\\\\`. *,__,---|;#;||| ',
                '            |T|¯|/\\\\\\\\^`. 7 7 7 7777|7|\\',
            ]),
            new Frame([
                '                                        ',
                '                                        ',
                '                                        ',
                ' ·                                      ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '               ,                        ',
                '              . *,                      ',
                '              \\`. *,                    ',
                '               \\\\`. *,           _____  ',
                '              /¯T\\\\`. *,        /;#;\\\\\\ ',
                '             /_/T\\\\\\\\`. *,__,---|;#;||| ',
                '            |T|¯|/\\\\\\\\^`. 7 7 7 7777|7|\\'
            ]),
            new Frame([
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '                                        ',
                '               ,                        ',
                '              . *,                      ',
                '              \\`. *,                    ',
                '               \\\\`. *,           _____  ',
                '              /¯T\\\\`. *,        /;#;\\\\\\ ',
                '             /_/T\\\\\\\\`. *,__,---|;#;||| ',
                '            |T|¯|/\\\\\\\\^`. 7 7 7 7777|7|\\',
            ], '#fff', 20),
        ])
    }
}
