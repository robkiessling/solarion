
export default {
    stars: {
        background: [ // todo rename image
            '  .               *                                .        *                      ·                *                         ·         *          ',
            '                                  ·                                  ·                                      ·                                   ·  ',
            '    ·                                     *                                *                                                                       ',
            '             ·               .                                                       ·                           ·           *           ·         ',
            '                                                       ·                                              ·                                            ',
            '                    *                                          *                                     *                            ·                ',
            '·                                     ·        *                                           ·        ·                                       *      ',
            '        *                       *                                                *                             *       ·               ·           ',
            '               ·                                                        .                                                      *                   ',
            '                                                           *                       ·                                                               ',
            '            *                       ·                                                       .            ·                         .            *  ',
        ],
        color: (elapsedTime, fractionOfDay) => {
            /**
             * Star opacity follows a linear (broken) graph that looks like this:
             *
             * opacity
             *   |\                  /
             *   | \                /
             *   |  \              /
             *   |   \            /
             *   |____\__________/____ fractionOfDay
             *   0        0.5       1.0
             *
             */
            const maxOpacity = 1.0, minOpacity = 0.0;
            const morningTime = 0.3; // fractionOfDay where stars should be hidden; x intercept of first line
            const eveningTime = 0.7; // fractionOfDay where stars should start appearing; x intercept of second line

            let opacity = 0;
            const opacityDiff = maxOpacity - minOpacity;

            if (fractionOfDay < morningTime) {
                // y = mx + b
                const m = -1 * opacityDiff / morningTime
                const b = maxOpacity // Calculating b at x = 0, so b = y
                opacity = m * fractionOfDay + b;
            }
            else if (fractionOfDay > eveningTime) {
                // y = mx + b
                const m = opacityDiff / (1 - eveningTime)
                const b = maxOpacity - m; // Calculating b at x = 1, so b = y - m where y is the maxOpacity
                opacity = m * fractionOfDay + b;
            }

            return `rgba(255, 255, 255, ${opacity})`
        }
    },
    planet: {
        background: [
            '                      /\\                          /\\                                          _                                   /\\               ',
            '      ,^._       /\\  /  \\               ,.`\\_.  .`  \\          _/\\        /\\                ./ \\                              /\\_/ .\\              ',
            '    _/  ``\\     /  \\/ ,  \\/\\           /     /\\/   ` \\       ./   \\      /   \\             / \\_ \\_              __..       /\\´ /\\   \\\\       ,_    ',
            '__,/   /   `>_,/    \\    /  \\`-.,,___.\'  ,  /  \\      `._.../      \\`\\\\_-     /`._-__..__./ ^  \\-_\\._..---._..-´    ``-,.-´   /  `.   `-_-,-´  \\.__',
            '       -          _        -       __              - -           _             ,      _             `           ´   _       -        _         -   ',
            '  -                                                                        _                         3--                      4__                 _',
            '                          -1-                              __2                                                                                     ',
        ],
        color: '#f9903c'
    }
}