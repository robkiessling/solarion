/**
 * Project-wide type vocabulary, declared globally so no file has to import it: coordinates, resource amounts, the
 * redux plumbing (actions, dispatch, root state) and the id unions that nearly every file touches.
 *
 * Everything else lives next to the code that owns it and is imported explicitly: database record shapes in the
 * database files, state slices in their redux modules, battle/squad/map shapes in their lib files. The file is a
 * module (the `export {}` at the bottom) so an accidental import can't silently change what is global;
 * `declare global` is what puts these names in scope everywhere. Nothing here runs; `npx tsc` reads it.
 */

declare global {
    /** [row, col] on the planet map */
    type Coord = [number, number];

    /** The ids of the resource and structure tables (derived from the tables themselves) */
    type ResourceId = import('./database/resources').ResourceId;
    type StructureId = import('./database/structures').StructureId;

    /** { resourceId: amount }, used for costs, consumption, production, capacity */
    type ResourceAmounts = Partial<Record<ResourceId, number>>;

    /** The whole redux state (see combineReducers in redux/reducer.ts) */
    type RootState = import('./redux/reducer').RootState;

    /**
     * Every action the reducers handle: the union of each module's action type (the `XxxAction` exports next to the
     * action constants in redux/modules). Reducers switch on `action.type`, which narrows `action.payload` to that
     * action's shape; dispatch sites are checked against the same shapes.
     */
    type GameAction =
        | import('./redux/reducer').RecalculateAction
        | import('./redux/modules/game').GameSliceAction
        | import('./redux/modules/clock').ClockAction
        | import('./redux/modules/log').LogAction
        | import('./redux/modules/triggers').TriggersAction
        | import('./redux/modules/resources').ResourcesAction
        | import('./redux/modules/structures').StructuresAction
        | import('./redux/modules/upgrades').UpgradesAction
        | import('./redux/modules/abilities').AbilitiesAction
        | import('./redux/modules/planet').PlanetAction
        | import('./redux/modules/star').StarAction
        | import('./redux/modules/panels').PanelsAction;

    type GetState = () => RootState;
    type Thunk<R = void> = (dispatch: Dispatch, getState: GetState) => R;
    /**
     * Thunk middleware: dispatching a thunk runs it and returns its result; dispatching an action returns the action.
     * The plain-action signature is what redux's own Store type expects, so the store still satisfies react-redux's Provider.
     */
    interface Dispatch {
        <R>(thunk: Thunk<R>): R;
        <A extends GameAction>(action: A): A;
        (action: GameAction | Thunk<unknown>): unknown;
    }

    // Dev-console handles set in redux/store.ts
    interface Window {
        solarionStore?: any;
        solarionBattle?: any;
        __REDUX_DEVTOOLS_EXTENSION_COMPOSE__?: any;
    }
}

export {};
