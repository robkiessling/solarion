
import _ from 'lodash';

const base = {
    idle: {
        ascii: [
            'TBD'
        ]
    }
}

export default {
    mineralHarvester: _.merge({}, base, {
        style: {
            height: '128px'
        },
        idle: {
            ascii: [
                '    T    ',
                '   ´|`   ',
                '   ´|`   ',
                '   ´|`   ',
                '   ´|`   ',
                '_//|||\\\\_',
                '---------'
            ]
        },
        running: [
            {
                ascii: [
                    '    T    ',
                    '   ´|`   ',
                    '   ´|`   ',
                    '   ´|`   ',
                    '_//  )\\\\_',
                    '---------'
                ],
                duration: 0.1
            },
            {
                ascii: [
                    '    T    ',
                    '   ´|`   ',
                    '   ´|`   ',
                    '   ´|`   ',
                    '_// ) \\\\_',
                    '---------'
                ],
                duration: 0.1
            },
            {
                ascii: [
                    '    T    ',
                    '   ´|`   ',
                    '   ´|`   ',
                    '   ´|`   ',
                    '_//)  \\\\_',
                    '---------'
                ],
                duration: 0.1
            }
        ]
    }),
    solarPanel: {
        style: {
            height: '128px',
            paddingBottom: '0.5rem',
            paddingTop: '1rem'
        },
        idle: {
            ascii: [
                ' _ _ _ _    ',
                ' \\_\\_\\_\\_\\  ',
                ' /\\_\\_\\_\\_\\ ',
                '/I¯\\_\\_\\_\\_\\',
            ]
        },
    }
};