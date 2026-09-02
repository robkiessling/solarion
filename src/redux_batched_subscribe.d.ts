// redux-batched-subscribe ships no types; only batchedSubscribe is used (redux/store.ts)
declare module 'redux-batched-subscribe' {
    import type { StoreEnhancer } from 'redux';
    export function batchedSubscribe(batch: (notify: () => void) => void): StoreEnhancer;
}
