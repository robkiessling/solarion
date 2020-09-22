import * as fromStructures from '../redux/modules/structures';
import * as fromResources from '../redux/modules/resources';
import * as fromUpgrades from '../redux/modules/upgrades';
import * as fromReducer from '../redux/reducer';
import {addTrigger} from "../redux/triggers";
import * as fromLog from "../redux/modules/log";
import {batch} from "react-redux";

export default {
    startup: {
        text: [
            ['Resuming last session...', 0, true],
            // ['', 2000],
            // ['yUE9ha2tMCpmVtpKqZSc', 100],
            // ['puKrMbdJZoO09kbxo40X', 100],
            // ['gFfKhzGPVSHwvGyYwdT6', 100],
            // ['dQ9kq7RMbVkTPjrHaqUF', 100],
            // ['Fu2ZOLxLqCa5JIrs4dYn', 100],
            // ['tMdJZAMZwY6itvypKRLE', 100],
            // ['Nfr3pPoxCuqOb6wZpZgB', 100],
            // ['PhjJOk2eQkcQIPlWzkhh', 100],
            // ['0VA8kLarEkErnYs8TkNp', 100],
            // ['1FHhErZXfl39dlEuEWs5', 100],
            // ['jn4p3K2ylr8jxVQ4hGRk', 100],
            // ['u5bsjsfJJ2jSSDLidBc1', 100],
            // ['mtPL2dwoxP04Gn9hfkvV', 100],
            // ['jSupjlXMCSMWCabxn3tR', 100],
            // ['JLGfBu2Cf5pnE9aFoOOk', 100],
            // ['SvbmwEw2KcofYi1eIh1n', 100],
            // ['70kBJKMfVlHVsnrOUQzo', 100],
            // ['2EMDBbNV5vYHeAjk1T2C', 100],
            // ['WMBtMjf6VM6A4Trdfb5O', 100],
            // ['cHb3exHm8xIVCTwwupN0', 100],
            // ['WkGM7GWxwb6HXi7SoJR4', 100],
            // ['55usa2sYLNDg3mT9dVji', 100],
            // ['HOA3zYkEte1BXZkTa1nS', 100],
            // ['THNizuhnXw78z7yXTkWn', 100],
            // ['YGHrlFKyNObJlDahYkfU', 100],
            // ['XMERhSzPI5Fpmv3MKHVF', 100],
            // ['xNyuMtk0jVNAVJI2g7Re', 100],
            // ['tMdJZAMZwY6itvypKRLE', 100],
            // ['Nfr3pPoxCuqOb6wZpZgB', 100],
            // ['PhjJOk2eQkcQIPlWzkhh', 100],
            // ['0VA8kLarEkErnYs8TkNp', 100],
            // ['1FHhErZXfl39dlEuEWs5', 100],
            // ['jn4p3K2ylr8jxVQ4hGRk', 100],
            // ['u5bsjsfJJ2jSSDLidBc1', 100],
            // ['mtPL2dwoxP04Gn9hfkvV', 100],
            // ['jSupjlXMCSMWCabxn3tR', 100],
            // ['JLGfBu2Cf5pnE9aFoOOk', 100],
            // ['SvbmwEw2KcofYi1eIh1n', 100],
            // ['70kBJKMfVlHVsnrOUQzo', 100],
            // ['2EMDBbNV5vYHeAjk1T2C', 100],
            // ['WMBtMjf6VM6A4Trdfb5O', 100],
            // ['cHb3exHm8xIVCTwwupN0', 100],
            // ['WkGM7GWxwb6HXi7SoJR4', 100],
            // ['55usa2sYLNDg3mT9dVji', 100],
            // ['HOA3zYkEte1BXZkTa1nS', 100],
            // ['THNizuhnXw78z7yXTkWn', 100],
            // ['YGHrlFKyNObJlDahYkfU', 100],
            // ['XMERhSzPI5Fpmv3MKHVF', 100],
            // ['xNyuMtk0jVNAVJI2g7Re', 100],
            // ['dqPKeBfukEghCbLcpRml', 100],
            // ['HsKx1UmLZU4c4R4cZcOy', 100],
            // ['yuksp0ZPG00QnRgwqqY4', 100],
            // ['NJlUcLGfIrsnQXewNkxp', 100],
            // ['J1MLcYA98T8mYnVorsbo', 100],
            // ['TE5N16ZhW9rLHmYpGoMl', 100],
            // ['posyxsfClu7nEm1XByd5', 100],
            // ['vct1EcFh4RJWV¦L6WFYj', 100],
            // ['eapi4gImm1tUPcnX9JPZ', 100],
            // ['DMW9 Bl4LD1Ygk¦¦JuwWW', 100],
            // ['HxAl kN6.YGr826k8BxcL7', 100],
            // ['Uoiq▓WCg..CTt8║      qZ2WVOeTx', 100],
            // ['tGL6 f889f..e;', 100],
            // ['Qu7h uAvF...xef  9gGUC6ZDSt', 100],
            // ['QjJo kY4Mjf||EWF  JqvK3jYtQB', 100],
            // ['9Bjf 6aI9pYwZB1k9Ye║▀', 100],
            // ['JuFZ 9hgp2F       [[[[iUvQvnsAxl', 100],
            // ['[[[ [ |||| =- **▒ ▒ ||    || |]]', 100],
            // ['[-----', 0],
            // ['▒▒▒ ║           |||| X  ▓', 0],
            // ['||', 0],
            // ['▒', 0],
            // ['', 0],
            // ['FATAL ERROR DETECTED', 0],
            // ['', 8000],
            // ['****************', 0],
            // ['****************', 0],
            // ['****************', 0],
            // [' ', 0],
            // ['RECOVERING', 0],
            // ['', 3000],
            // ['Error code: 18589194123098', 0],
            // ['ADDR:', 100],
            // ['[3260 7515 1562]', 0],
            // ['[3064 3772 8098]', 0],
            // ['[6849 7590 4712]', 0],
            // ['[5196 8857 2428]', 0],
            // ['[2598 8722 0112]', 0],
            // ['[5350 6892 8792]', 0],
            // ['[6240 4625 6629]', 0],
            // ['[6433 3822 8854]', 0],
            // ['[0140 5313 1417]', 0],
            // ['', 3500],
            // ['#################################', 10],
            // ['', 10],
            // ['Safe boot', 10],
            // ['***', 10],
            // ['*** start.sc', 10],
            // ['*** 0x003041 0x000000 0xA03B00', 10],
            // ['***', 10],
            // ['', 2000],
            // ['AE74923 V8.4 2104-04-11', 10],
            // ['', 10],
            // ['Solarion(R) CORE', 10],
            // ['', 5000],
            // ['Performing system checks...', 2000],
            // ['Energy        1200u', 800],
            // ['Capacity      2000u', 800],
            // ['Oxygen        40%', 800],
            // ['Water         33%', 800],
            // ['Mineral Ore   0', 2000],
            // ['Life Support  ERR', 2000],
            // ['Auxiliary     ERR', 800],
            // ['Last OP       3419394', 800],
            // ['', 1000],
            // ['Activating Central Interface', 2000, true],
            // ['', 100],
            // ['System: ready', 2000],
            // ['Mining: operational', 2000, true],
            ['', 100],
            ['Awaiting input...', 0, true],
            ['', 100]
        ],
        onFinish: (dispatch) => {
            // TODO Move this into a 'game_processes' database file or something like that?
            batch(() => {
                dispatch(fromResources.learn('energy'));
                dispatch(fromResources.learn('minerals'));
                dispatch(fromStructures.learn('mineralHarvester'));
                dispatch(fromStructures.buildForFree('mineralHarvester', 1));
            })

            addTrigger(
                (state) => state.resources.byId.energy,
                (slice) => slice.amount === 0,
                () => {
                    dispatch(fromLog.startLogSequence('energyDepleted'));
                }
            )
        }
    },

    energyDepleted: {
        text: [
            ['Energy depleted. Researching solutions...', 500, true], // todo make longer?
            ['', 0],
            ['New Schematic Found:', 0, true],
            ['Solar Panels', 0, true],
            ['', 0]
        ],
        onFinish: (dispatch) => {
            dispatch(fromUpgrades.discover('researchSolar'));
            dispatch(fromUpgrades.discover('researchGas'));

            // dispatch(fromResources.learn('vents'));
            // dispatch(fromStructures.learn('solarPanel'));
            // dispatch(fromStructures.learn('thermalVent'));
            //
            // dispatch(fromStructures.learn('energyBay'));
            //
            // dispatch(fromUpgrades.learn('solarPanel', 'solarPanel_largerPanels'));
            // dispatch(fromUpgrades.learn('energyBay', 'energyBay_largerCapacity'));

            // addTrigger(
            //     (state) => state.resources.byId.energy,
            //     (slice) => slice.lifetimeTotal > 250,
            //     () => {
            //         // dispatch(fromUpgrades.learn('solarPanel', 'solarPanel_largerPanels'));
            //     }
            // )
        }
    },

}