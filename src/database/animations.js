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
    constructor(charArray, color = '#fff', cycles = 1) {
        this.charArray = charArray;
        this.color = color;
        this.cycles = cycles;
    }

    getFrame() {
        return this;
    }

    toDisplay() {
        return this.charArray;
    }
}

class Animation {
    constructor(options, frames) {
        // this.fps = fps;
        this.fps = options.fps;
        this.randomFps = options.randomFps;
        this.identical = options.identical;

        this.frames = this._unfoldFrames(frames);
    }

    _unfoldFrames(frames) {
        const result = [];
        frames.forEach(frame => {
            for (let i = 0; i < frame.cycles; i++) {
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
    }
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
        idle: new RandomAnimation({},
            WIND_TURBINE_FRAMES
        ),
        running: new Animation({randomFps: [1, 0.8, 1.2, 0.75, 0.5, 1.3]},
            WIND_TURBINE_FRAMES
        )
    },

    // todo thermal vent

    energyBay: {
        idle: new Animation({fps: 8, identical: true}, [
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
            ], [], 10),
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
    }
}

const old = {
    harvester: _.merge({}, base, {
        style: {
            bottom: '4px'
        },
        background: [
            '            ',
            ' TTT8>//==║ ',
            '/____|_|  ║ ',
            'oo oo oo  | ',
        ],
        idle: {
            ascii: [
                '          | ',
                '          ║ ',
                '          ║ ',
                '          V ',
            ]
        },
        running: [
            {
                ascii: [
                    '          | ',
                    '          ║ ',
                    '          ║ ',
                    '         `║,',
                ],
                duration: 0.25
            },
            {
                ascii: [
                    '          | ',
                    '          ║ ',
                    '          ║ ',
                    '         .║\'',
                ],
                duration: 0.25
            },
            {
                ascii: [
                    '          | ',
                    '          ║ ',
                    '          ║ ',
                    '         \\║,',
                ],
                duration: 0.25
            },
            {
                ascii: [
                    '          | ',
                    '          ║ ',
                    '          ║ ',
                    '         .║;',
                ],
                duration: 0.25
            },
        ]
    }),
    solarPanel: {
        style: {
            bottom: '8px',
        },
        idle: [
            {
                ascii: [
                    ' _ _ _ _    ',
                    ' \\_\\_\\_\\_\\  ',
                    ' /\\_\\_\\_\\_\\ ',
                    '/I¯\\_\\_\\_\\_\\',
                ],
                duration: 2
            }
        ],
    },
    windTurbine: {
        style: {
            bottom: '2px'
        },
        background: [
            '       ',
            '       ',
            '   OD  ',
            '    ║  ',
            '    ║  ',
            '    ║  ',
        ],
        idle: {
            ascii: [
                '   |   ',
                '   |   ',
                '   O   ',
                '  / \\  ',
                ' /  ║\\ ',
                '    ║  ',
            ]
        },
        running: [
            {
                ascii: [
                    '     / ',
                    '    /  ',
                    '---O   ',
                    '    \\  ',
                    '    ║\\ ',
                    '    ║  ',
                ],
                duration: 0.45
            },
            {
                ascii: [
                    '   |   ',
                    '   |   ',
                    '   O---',
                    '  / ║  ',
                    ' /  ║  ',
                    '    ║  ',
                ],
                duration: 0.45
            },
            {
                ascii: [
                    ' \\   / ',
                    '  \\ /  ',
                    '   O   ',
                    '   |║  ',
                    '   |║  ',
                    '    ║  ',
                ],
                duration: 0.45
            },
            {
                ascii: [
                    '   |   ',
                    '   |   ',
                    '---O   ',
                    '    \\  ',
                    '    ║\\ ',
                    '    ║  ',
                ],
                duration: 0.45
            },
            {
                ascii: [
                    ' \\     ',
                    '  \\    ',
                    '   O---',
                    '  / ║  ',
                    ' /  ║  ',
                    '    ║  ',
                ],
                duration: 0.45
            },
            {
                ascii: [
                    '     / ',
                    '    /  ',
                    '---O   ',
                    '   |║  ',
                    '   |║  ',
                    '    ║  ',
                ],
                duration: 0.45
            },
            {
                ascii: [
                    '   |   ',
                    '   |   ',
                    '   O   ',
                    '  / \\  ',
                    ' /  ║\\ ',
                    '    ║  ',
                ],
                duration: 0.45
            },
            {
                ascii: [
                    ' \\     ',
                    '  \\    ',
                    '   O---',
                    '   |║  ',
                    '   |║  ',
                    '    ║  ',
                ],
                duration: 0.45
            },
        ],
    },
    thermalVent: {
        style: {
            bottom: '2px',
        },
        idle: [
            {
                ascii: [
                    '  ,-~--~-,  ',
                    ' /`·,~-.-´\\ ',
                    '/ ,; ,  \\. \\',
                ],
                duration: 5
            },
            {
                ascii: [
                    '  ,-)--~-,  ',
                    ' /`·,~-.-´\\ ',
                    '/ ,; ,  \\. \\',
                ],
                duration: 0.15
            },
            {
                ascii: [
                    '   (        ',
                    '  ,-)--~-,  ',
                    ' /`·,~-.-´\\ ',
                    '/ ,; ,  \\. \\',

                ],
                duration: 0.15
            },
            {
                ascii: [
                    '    )       ',
                    '   (        ',
                    '  ,-)--~-,  ',
                    ' /`·,~-.-´\\ ',
                    '/ ,; ,  \\. \\',

                ],
                duration: 0.15
            },
            {
                ascii: [
                    '   (        ',
                    '    )       ',
                    '   (        ',
                    '  ,-~--~-,  ',
                    ' /`·,~-.-´\\ ',
                    '/ ,; ,  \\. \\',

                ],
                duration: 0.15
            },
            {
                ascii: [
                    '    )       ',
                    '   (        ',
                    '    )       ',
                    '            ',
                    '  ,-~--~-,  ',
                    ' /`·,~-.-´\\ ',
                    '/ ,; ,  \\. \\',

                ],
                duration: 0.15
            },
            {
                ascii: [
                    '    )       ',
                    '   (        ',
                    '            ',
                    '            ',
                    '  ,-~--~-,  ',
                    ' /`·,~-.-´\\ ',
                    '/ ,; ,  \\. \\',
                ],
                duration: 0.15
            },
            {
                ascii: [
                    '    )       ',
                    '            ',
                    '            ',
                    '            ',
                    '  ,-~--~-,  ',
                    ' /`·,~-.-´\\ ',
                    '/ ,; ,  \\. \\',
                ],
                duration: 0.15
            },

            // ---- 2nd plume
            {
                ascii: [
                    '  ,-~--~-,  ',
                    ' /`·,~-.-´\\ ',
                    '/ ,; ,  \\. \\',
                ],
                duration: 3
            },
            {
                ascii: [
                    '  ,-~--)-,  ',
                    ' /`·,~-.-´\\ ',
                    '/ ,; ,  \\. \\',
                ],
                duration: 0.15
            },
            {
                ascii: [
                    '      (     ',
                    '  ,-~--)-,  ',
                    ' /`·,~-.-´\\ ',
                    '/ ,; ,  \\. \\',
                ],
                duration: 0.15
            },
            {
                ascii: [
                    '       ))   ',
                    '      (     ',
                    '  ,-~--)-,  ',
                    ' /`·,~-.-´\\ ',
                    '/ ,; ,  \\. \\',
                ],
                duration: 0.15
            },
            {
                ascii: [
                    '      ((    ',
                    '       ))   ',
                    '      (     ',
                    '  ,-~--)-,  ',
                    ' /`·,~-.-´\\ ',
                    '/ ,; ,  \\. \\',
                ],
                duration: 0.15
            },
            {
                ascii: [
                    '     ) ) )  ',
                    '      ((    ',
                    '       ))   ',
                    '      (     ',
                    '  ,-~--~-,  ',
                    ' /`·,~-.-´\\ ',
                    '/ ,; ,  \\. \\',
                ],
                duration: 0.15
            },
            {
                ascii: [
                    '     ) ) )  ',
                    '      ((    ',
                    '       ))   ',
                    '            ',
                    '  ,-~--~-,  ',
                    ' /`·,~-.-´\\ ',
                    '/ ,; ,  \\. \\',
                ],
                duration: 0.15
            },
            {
                ascii: [
                    '     ) ) )  ',
                    '      ((    ',
                    '            ',
                    '            ',
                    '  ,-~--~-,  ',
                    ' /`·,~-.-´\\ ',
                    '/ ,; ,  \\. \\',
                ],
                duration: 0.15
            },
            {
                ascii: [
                    '     ) ) )  ',
                    '            ',
                    '            ',
                    '            ',
                    '  ,-~--~-,  ',
                    ' /`·,~-.-´\\ ',
                    '/ ,; ,  \\. \\',
                ],
                duration: 0.15
            }
        ]
    },
    energyBay: {
        style: {
            bottom: '4px',
        },
        idle: [
            {
                ascii: [
                    '  ______  ',
                    ' ||-|-|-| ',
                    ' ||_____| ',
                    '/__\\ ___ \\',
                ],
                duration: 3
            },
            {
                ascii: [
                    '  ______  ',
                    ' ||=|-|-| ',
                    ' ||_____| ',
                    '/__\\ ___ \\',
                ],
                duration: 0.1
            },
            {
                ascii: [
                    '  ______  ',
                    ' ||-|=|-| ',
                    ' ||_____| ',
                    '/__\\ ___ \\',
                ],
                duration: 0.1
            },
            {
                ascii: [
                    '  ______  ',
                    ' ||-|-|=| ',
                    ' ||_____| ',
                    '/__\\ ___ \\',
                ],
                duration: 0.1
            },
            {
                ascii: [
                    '  ______  ',
                    ' ||-|=|-| ',
                    ' ||_____| ',
                    '/__\\ ___ \\',
                ],
                duration: 0.1
            },
            {
                ascii: [
                    '  ______  ',
                    ' ||=|-|-| ',
                    ' ||_____| ',
                    '/__\\ ___ \\',
                ],
                duration: 0.1
            },
        ],
    },
    sensorTower: {
        style: {
            fontSize: '12px'
        },
        idle: [
            {
                ascii: [
                    '    __   ',
                    '   |  `. ',
                    '   ;\\ ´ \\',
                    '    \'`--´',
                    '   /#\\   ',
                ],
                duration: 12
            },
            {
                ascii: [
                    '   ___   ',
                    '  ´ . `  ',
                    ' |  \'  | ',
                    '  `---´  ',
                    '   /#\\   ',
                ],
                duration: 8
            },
            {
                ascii: [
                    '   __    ',
                    ' .´  |   ',
                    '/ ` /;   ',
                    '`--´\'    ',
                    '   /#\\   ',
                ],
                duration: 12
            },
            {
                ascii: [
                    '   ___   ',
                    '  ´ . `  ',
                    ' |  ┴  | ',
                    '  `---´  ',
                    '   /#\\   ',
                ],
                duration: 8
            }
        ]
    },
    probeFactory: {
        style: {},
        background: [
            '              ',
            ' \'.           ',
            '  \\\'.         ',
            '   \\\\\'.       ',
            '  /¯T\\\\\'.     ',
            ' /_/T\\\\\\\\\'.   ',
            '|T|¯|/\\\\\\\\\\\'.  '
        ],
        running: [
            {
                ascii: [
                    '              ',
                    '              ',
                    '              ',
                    '              ',
                    '              ',
                    '              ',
                    '              ',
                ],
                duration: 0.0625
            },
            {
                ascii: [
                    '              ',
                    '              ',
                    '              ',
                    '              ',
                    '              ',
                    '              ',
                    '             ·',
                ],
                duration: 0.0625
            },
            {
                ascii: [
                    '              ',
                    '              ',
                    '              ',
                    '              ',
                    '              ',
                    '           ·  ',
                    '              ',
                ],
                duration: 0.0625
            },
            {
                ascii: [
                    '              ',
                    '              ',
                    '              ',
                    '              ',
                    '         ·    ',
                    '              ',
                    '              ',
                ],
                duration: 0.0625
            },
            {
                ascii: [
                    '              ',
                    '              ',
                    '              ',
                    '       ·      ',
                    '              ',
                    '              ',
                    '              ',
                ],
                duration: 0.0625
            },
            {
                ascii: [
                    '              ',
                    '              ',
                    '     ·        ',
                    '              ',
                    '              ',
                    '              ',
                    '              ',
                ],
                duration: 0.0625
            },
            {
                ascii: [
                    '              ',
                    '   ·          ',
                    '              ',
                    '              ',
                    '              ',
                    '              ',
                    '              ',
                ],
                duration: 0.0625
            },
            {
                ascii: [
                    ' ·            ',
                    '              ',
                    '              ',
                    '              ',
                    '              ',
                    '              ',
                    '              ',
                ],
                duration: 0.0625
            },
            {
                ascii: [
                    '              ',
                    '              ',
                    '              ',
                    '              ',
                    '              ',
                    '              ',
                    '              ',
                ],
                duration: 0.0625
            },
        ]
    },

    refinery: {
        style: {
            paddingBottom: '4px'
        },
        background: [
            ' __     .  ',
            ' ║║  _  |  ',
            ' ║║==║-=║  ',
            '/__\\  \\  \\ ',
        ],
        running: [
            {
                ascii: [
                    '           ',
                    '           ',
                    '           ',
                    '           ',
                ],
                duration: 0.41
            },
            {
                ascii: [
                    '           ',
                    '           ',
                    '           ',
                    ' -=        ',
                    '           ',
                    '           ',
                    '           ',
                ],
                duration: 0.41
            },
            {
                ascii: [
                    '           ',
                    '           ',
                    '  =≡       ',
                    ' =-        ',
                    '           ',
                    '           ',
                    '           ',
                ],
                duration: 0.41
            },
            {
                ascii: [
                    '           ',
                    '   _=-     ',
                    '  -=       ',
                    ' -=        ',
                    '           ',
                    '           ',
                    '           ',
                ],
                duration: 0.41
            },
            {
                ascii: [
                    '    =-≡¯   ',
                    '   ¯-=     ',
                    '  -¯       ',
                    '  ¯        ',
                    '           ',
                    '           ',
                    '           ',
                ],
                duration: 0.41
            },

            {
                ascii: [
                    '    ¯=¯=   ',
                    '    =¯     ',
                    '   ¯       ',
                    '           ',
                    '           ',
                    '           ',
                    '           ',
                ],
                duration: 0.41
            },

            {
                ascii: [
                    '     -≡   ',
                    '    -¯    ',
                    '           ',
                    '           ',
                    '           ',
                    '           ',
                    '           ',
                ],
                duration: 0.41
            },

            {
                ascii: [
                    '     ¯=¯   ',
                    '           ',
                    '           ',
                    '           ',
                    '           ',
                    '           ',
                    '           ',
                ],
                duration: 0.41
            },
            {
                ascii: [
                    '           ',
                    '           ',
                    '           ',
                    '           ',
                ],
                duration: 0.41
            },
        ]
    },
    droidFactory: {
        style: {
            bottom: '0px',
        },
        idle: [
            {
                ascii: [
                    '            ',
                    ' (x   ¯¯¯¯¯¯',
                    '   \\        ',
                    '    =[>  [> ',
                    ' /\\  /\\  /\\ ',
                    ' /\\  /\\  /\\ ',
                    '-o--o--o--o-',
                ],
                duration: 0.166
            },
            {
                ascii: [
                    '           [',
                    ' (x   ¯¯¯¯¯¯',
                    '   \\        ',
                    '    =[>  [> ',
                    ' /\\  /\\  /\\ ',
                    ' /\\  /\\  /\\ ',
                    '-o--o--o--o-',
                ],
                duration: 0.166
            },
            {
                ascii: [
                    '          [>',
                    ' (x   ¯¯¯¯¯¯',
                    '   \\        ',
                    '    =[>  [> ',
                    ' /\\  /\\` /\\ ',
                    ' /\\  /\\  /\\ ',
                    '-o--o--o--o-',
                ],
                duration: 0.166
            },
            {
                ascii: [
                    '         [> ',
                    ' (x   ¯¯¯¯¯¯',
                    '   \\        ',
                    '    =[>, [> ',
                    ' /\\ ´/\\  /\\ ',
                    ' /\\  /\\  /\\ ',
                    '-o--o--o--o-',
                ],
                duration: 0.166
            },
            {
                ascii: [
                    '        [>  ',
                    ' (x   ¯¯¯¯¯¯',
                    '   \\        ',
                    '    =[>  [> ',
                    ' /\\ \'/\\` /\\ ',
                    ' /\\  /\\  /\\ ',
                    '-o--o--o--o-',
                ],
                duration: 0.166
            },
            {
                ascii: [
                    '       [>   ',
                    ' (x   ¯¯¯¯¯¯',
                    '   \\        ',
                    '    =[>  [> ',
                    ' /\\ `/\\\' /\\ ',
                    ' /\\  /\\  /\\ ',
                    '-o--o--o--o-',
                ],
                duration: 0.166
            },
            {
                ascii: [
                    '      [>    ',
                    ' (x   ¯¯¯¯¯¯',
                    '   \\        ',
                    '    =[>  [> ',
                    ' /\\  /\\  /\\ ',
                    ' /\\  /\\  /\\ ',
                    '-o--o--o--o-',
                ],
                duration: 0.166
            },
            {
                ascii: [
                    '      [>    ',
                    ' (x_  ¯¯¯¯¯¯',
                    '    -=      ',
                    '     [>  [> ',
                    ' /\\  /\\  /\\ ',
                    ' /\\  /\\  /\\ ',
                    '-o--o--o--o-',
                ],
                duration: 0.166
            },
            {
                ascii: [
                    '      [>    ',
                    ' (+--=¯¯¯¯¯¯',
                    '            ',
                    '      [>  [>',
                    '  /\\  /\\  /\\',
                    '  /\\  /\\  /\\',
                    '-o--o--o--o-',
                ],
                duration: 0.166
            },
            {
                ascii: [
                    '   _-=[>    ',
                    ' (x   ¯¯¯¯¯¯',
                    '            ',
                    '       [>  [',
                    '\\  /\\  /\\  /',
                    '\\  /\\  /\\  /',
                    '-o--o--o--o-',
                ],
                duration: 0.166
            },
            {
                ascii: [
                    '            ',
                    ' (+--=[>¯¯¯¯',
                    '            ',
                    '        [>  ',
                    '/\\  /\\  /\\  ',
                    '/\\  /\\  /\\  ',
                    '-o--o--o--o-',
                ],
                duration: 0.166
            },
            {
                ascii: [
                    '            ',
                    ' (x   ¯¯¯¯¯¯',
                    '   \\-=[>    ',
                    '         [> ',
                    ' /\\  /\\  /\\ ',
                    ' /\\  /\\  /\\ ',
                    '-o--o--o--o-',
                ],
                duration: 0.166
            }
        ]
    }
};