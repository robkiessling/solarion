
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
                '  _´|`_  ',
                '_//` \\`\\_',
                '---------',
            ]
        },
        running: [
            {
                ascii: [
                    '    T    ',
                    '   ´|`   ',
                    '   ´|`   ',
                    '   ´|`   ',
                    '  _´|`_  ',
                    '_/ /` \\\\_',
                    '---------',
                ],
                duration: 0.3
            },
            {
                ascii: [
                    '    T    ',
                    '   ´|`   ',
                    '   ´|`   ',
                    '   ´|`   ',
                    '  _´|`_  ',
                    '_//` \\`\\_',
                    '---------',
                ],
                duration: 0.3
            },
            {
                ascii: [
                    '    T    ',
                    '   ´|`   ',
                    '   ´|`   ',
                    '   ´|`   ',
                    '  _´|`_  ',
                    '_/` |` \\_',
                    '---------',
                ],
                duration: 0.3
            }
        ]
    }),
    solarPanel: {
        style: {
            height: '120px',
            paddingBottom: '8px',
            paddingTop: ''
        },
        idle: {
            ascii: [
                ' _ _ _ _    ',
                ' \\_\\_\\_\\_\\  ',
                ' /\\_\\_\\_\\_\\ ',
                '/I¯\\_\\_\\_\\_\\',
            ]
        },
    },
    energyBay: {
        style: {
            height: '120px',
            paddingBottom: '8px',
            paddingTop: ''
        },
        idle: {
            ascii: [
                '  ______  ',
                ' || . ; | ',
                ' ||_____| ',
                '/_ \\ _   \\',
            ]
        },
    }
};