import {
	type ComponentDesign,
	type ComponentSetup,
	makeCreate,
	makeExtendTransform,
	makeWithTransform
} from './component';

/**
 * Child argument for `design(parent, child)`.
 * Either a setup function (receives parent instance) or another design.
 *
 * @typeParam TDeps - Dependencies type for the parent/child designs
 * @typeParam TParent - Parent component instance type
 * @typeParam TInstance - Child component instance type
 */
export type DesignChildArg<TDeps, TParent, TInstance> =
	ComponentSetup<TParent, TInstance> |
	ComponentDesign<TDeps, TInstance>;

/**
 * Returns true if the value is a ComponentDesign.
 *
 * @param obj - Value to check
 * @returns The value is a ComponentDesign
 */
function isComponentDesign( obj: unknown ): obj is ComponentDesign<any, any> {
	return !!obj && typeof obj === 'object' && 'create' in obj && typeof ( obj as any ).create === 'function';
}

/**
 * Define a simple component design from a setup function.
 *
 * @example
 * const Env = design( () => ( { apiKey: process.env.API_KEY } ) );
 * const instance = Env.create();
 */
export function design<TDeps = void, TInstance = any>(
	setup: ( deps: TDeps ) => TInstance
): ComponentDesign<TDeps, TInstance>;
/**
 * Define a child design that depends on a parent design.
 * The child can be a setup function (receives parent instance) or another design.
 *
 * @example
 * const Cache = design( () => ( {
 * 	get: ( k: string ) => undefined,
 * 	set: ( k: string, v: string ) => void 0
 * } ) );
 * const Documents = design( Cache, ( store ) => ( {
 * 	get: ( id: string ) => store.get( `doc:${id}` ),
 * 	set: ( id: string, val: string ) => store.set( `doc:${id}`, val )
 * } ) );
 */
export function design<TDeps, TParent, TInstance>(
	parent: ComponentDesign<TDeps, TParent>,
	child: DesignChildArg<TDeps, TParent, TInstance>
): ComponentDesign<TDeps, TInstance>;
export function design<TDeps = any, TParent = any, TInstance = any>(
	setupOrParent: ( ( deps: TDeps ) => TInstance ) | ComponentDesign<TDeps, TParent>,
	child?: DesignChildArg<TDeps, TParent, TInstance>
): ComponentDesign<TDeps, TInstance> {
	const isParentDesign = isComponentDesign( setupOrParent );

	let setupFn: ( deps: TDeps ) => TInstance;

	if ( !isParentDesign ) {
		// design( setup )
		setupFn = setupOrParent as ( deps: TDeps ) => TInstance;
	} else {
		// design( parent, child ) where child is either setup or ComponentDesign
		const parentDesign = setupOrParent as ComponentDesign<TDeps, TParent>;
		if ( typeof child === 'function' ) {
			setupFn = ( deps: TDeps ) => {
				const parent = parentDesign.create( deps );
				return ( child as ComponentSetup<TParent, TInstance> )( parent );
			};
		} else if ( child && isComponentDesign( child ) ) {
			const childDesign = child as ComponentDesign<TDeps, TInstance>;
			setupFn = ( deps: TDeps ) => childDesign.create( deps );
		} else {
			throw new Error( 'Invalid child argument to design()' );
		}
	}

	type CreateFn = TDeps extends void ?
		{ (): TInstance, ( deps: TDeps ): TInstance } :
		keyof TDeps extends never ?
			{ (): TInstance, ( deps: TDeps ): TInstance } :
			{ ( deps: TDeps ): TInstance };

	const create = makeCreate( setupFn ) as CreateFn;

	return {
		create,
		with: makeWithTransform( setupFn ),
		extend: makeExtendTransform( setupFn )
	} as ComponentDesign<TDeps, TInstance>;
}
