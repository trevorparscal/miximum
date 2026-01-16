import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compose, design } from '../src/index.js';

describe( 'design()', () => {
	describe( 'basic design', () => {
		it( 'creates instance from setup function', () => {
			const Service = design( () => ( { value: 42 } ) );
			const instance = Service.create();
			assert.equal( instance.value, 42 );
		} );

		it( 'passes dependencies to setup function', () => {
			const Service = design( ( deps: { x: number } ) => ( { result: deps.x * 2 } ) );
			const instance = Service.create( { x: 5 } );
			assert.equal( instance.result, 10 );
		} );

		it( 'creates fresh instances on each call', () => {
			const Service = design( () => ( { id: Math.random() } ) );
			const a = Service.create();
			const b = Service.create();
			assert.notEqual( a.id, b.id );
		} );
	} );

	describe( 'parent design dependency', () => {
		it( 'passes parent instance to child setup', () => {
			const Parent = design( ( deps: { name: string } ) => ( {
				name: deps.name,
				greet: () => `Hello, ${deps.name}`
			} ) );

			const Child = design( Parent, ( parent ) => ( {
				message: parent.greet()
			} ) );

			const instance = Child.create( { name: 'Alice' } );
			assert.equal( instance.message, 'Hello, Alice' );
		} );

		it( 'allows child to extend parent functionality', () => {
			const Logger = design( () => ( {
				log: ( msg: string ) => `[LOG] ${msg}`
			} ) );

			const EnhancedLogger = design( Logger, ( logger ) => ( {
				...logger,
				error: ( msg: string ) => `[ERROR] ${msg}`
			} ) );

			const instance = EnhancedLogger.create();
			assert.equal( instance.log( 'test' ), '[LOG] test' );
			assert.equal( instance.error( 'test' ), '[ERROR] test' );
		} );

		it( 'allows child as another design', () => {
			const Parent = design( () => ( { value: 10 } ) );
			const Child = design( ( _deps: void ) => ( { multiplied: 20 } ) );
			const Combined = design( Parent, Child );
			const instance = Combined.create();
			assert.equal( instance.multiplied, 20 );
		} );
	} );

	describe( '.create()', () => {
		it( 'requires dependencies when specified', () => {
			const Service = design( ( deps: { required: string } ) => ( {
				value: deps.required
			} ) );
			const instance = Service.create( { required: 'test' } );
			assert.equal( instance.value, 'test' );
		} );

		it( 'works without dependencies for void designs', () => {
			const Service = design( () => ( { static: 42 } ) );
			const instance = Service.create();
			assert.equal( instance.static, 42 );
		} );
	} );

	describe( '.with(values)', () => {
		it( 'pre-fills specific dependency values', () => {
			const Config = design( ( deps: { host: string, port: number } ) => ( {
				url: `${deps.host}:${deps.port}`
			} ) );

			const ProdConfig = Config.with( { port: 5432 } );
			const instance = ProdConfig.create( { host: 'prod.example.com' } );
			assert.equal( instance.url, 'prod.example.com:5432' );
		} );

		it( 'combines pre-filled and provided values', () => {
			const Db = design( ( deps: { host: string, port: number, ssl: boolean } ) => ( {
				config: deps
			} ) );

			const SecureDb = Db.with( { ssl: true } );
			const instance = SecureDb.create( { host: 'localhost', port: 3306 } );
			assert.deepEqual( instance.config, {
				host: 'localhost',
				port: 3306,
				ssl: true
			} );
		} );

		it( 'allows chaining with() calls', () => {
			const Service = design( ( deps: { a: number, b: number, c: number } ) => ( {
				sum: deps.a + deps.b + deps.c
			} ) );

			const Configured = Service.with( { a: 1 } ).with( { b: 2 } );
			const instance = Configured.create( { c: 3 } );
			assert.equal( instance.sum, 6 );
		} );
	} );

	describe( '.extend<T>()', () => {
		it( 'declares additional dependencies for child designs', () => {
			const Logger = design( ( deps: { prefix: string } ) => ( {
				log: ( msg: string ) => `[${deps.prefix}] ${msg}`
			} ) );

			// extend() allows the design to accept more deps when used as parent
			const ExtendedLogger = Logger.extend<{ timestamp: boolean }>();

			// Child design can now receive both prefix and timestamp
			const TimestampedLogger = design( ExtendedLogger, ( logger ) => ( {
				log: ( msg: string ) => {
					// Parent only uses prefix, but child can use timestamp if passed
					return logger.log( msg );
				}
			} ) );

			const instance = TimestampedLogger.create( { prefix: 'INFO', timestamp: true } );
			assert.equal( instance.log( 'test' ), '[INFO] test' );
		} );

		it( 'allows parent design to accept extended dependencies', () => {
			const Logger = design( ( deps: { prefix: string } ) => ( {
				prefix: deps.prefix
			} ) );

			// extend() adds type requirement for additional deps
			const ExtendedLogger = Logger.extend<{ timeout: number }>();

			// When used as parent, create requires both prefix and timeout
			const instance = ExtendedLogger.create( { prefix: 'INFO', timeout: 5000 } );
			assert.equal( instance.prefix, 'INFO' );
		} );
	} );
} );

describe( 'compose()', () => {
	describe( 'list composition - dynamic property/getter/setter', () => {
		it( 'reflects dynamic changes to primitive properties', () => {
			// Component with a primitive property
			let value = 1;
			const A = design( () => ( {
				get x() { return value; },
				set x( v ) { value = v; }
			} ) );
			const B = design( () => ( {
				y: 2
			} ) );
			const Combined = compose( [ A, B ] );
			const instance = Combined.create();
			// Initial values
			assert.equal( instance.x, 1 );
			assert.equal( instance.y, 2 );
			// Change the underlying value
			value = 42;
			assert.equal( instance.x, 42, 'getter reflects updated value' );
			// Use setter through proxy
			instance.x = 100;
			assert.equal( value, 100, 'setter updates underlying value' );
			assert.equal( instance.x, 100, 'getter reflects new value after setter' );
		} );

		it( 'does not create static copies of getters', () => {
			let count = 0;
			const A = design( () => ( {
				get dynamic() { return ++count; }
			} ) );
			const Combined = compose( [ A ] );
			const instance = Combined.create();
			const v1 = instance.dynamic;
			const v2 = instance.dynamic;
			assert.notEqual( v1, v2, 'getter is called each time' );
		} );

		it( 'last design wins for overlapping properties/getters', () => {
			const a = 1;
			let b = 2;
			const A = design( () => ( {
				get value() { return a; }
			} ) );
			const B = design( () => ( {
				get value() { return b; }
			} ) );
			const Combined = compose( [ A, B ] );
			const instance = Combined.create();
			assert.equal( instance.value, 2 );
			b = 99;
			assert.equal( instance.value, 99, 'getter from last design is used' );
		} );
	} );
	describe( 'list composition', () => {
		it( 'merges multiple designs into one', () => {
			const Logger = design( () => ( {
				log: ( msg: string ) => `[LOG] ${msg}`
			} ) );

			const Timer = design( () => ( {
				time: () => Date.now()
			} ) );

			const Combined = compose( [ Logger, Timer ] );
			const instance = Combined.create();
			assert.equal( typeof instance.log, 'function' );
			assert.equal( typeof instance.time, 'function' );
		} );

		it( 'later designs overwrite earlier ones', () => {
			const A = design( () => ( { value: 'A' } ) );
			const B = design( () => ( { value: 'B' } ) );

			const Combined = compose( [ A, B ] );
			const instance = Combined.create();
			assert.equal( instance.value, 'B' );
		} );

		it( 'passes shared dependencies to all designs', () => {
			const ServiceA = design( ( deps: { name: string } ) => ( {
				a: `Service A: ${deps.name}`
			} ) );

			const ServiceB = design( ( deps: { name: string } ) => ( {
				b: `Service B: ${deps.name}`
			} ) );

			const Combined = compose( [ ServiceA, ServiceB ] );
			const instance = Combined.create( { name: 'test' } );
			assert.equal( instance.a, 'Service A: test' );
			assert.equal( instance.b, 'Service B: test' );
		} );

		it( 'works with empty list', () => {
			const Combined = compose( [] );
			const instance = Combined.create();
			assert.deepEqual( instance, {} );
		} );
	} );

	describe( 'map composition', () => {
		it( 'nests designs under object keys', () => {
			const Http = design( () => ( { protocol: 'http' } ) );
			const Https = design( () => ( { protocol: 'https' } ) );

			const Combined = compose( { http: Http, https: Https } );
			const instance = Combined.create();
			assert.equal( instance.http.protocol, 'http' );
			assert.equal( instance.https.protocol, 'https' );
		} );

		it( 'passes shared dependencies to all designs', () => {
			const Http = design( ( deps: { port: number } ) => ( {
				url: `http://localhost:${deps.port}`
			} ) );

			const Https = design( ( deps: { port: number } ) => ( {
				url: `https://localhost:${deps.port}`
			} ) );

			const Combined = compose( { http: Http, https: Https } );
			const instance = Combined.create( { port: 8080 } );
			assert.equal( instance.http.url, 'http://localhost:8080' );
			assert.equal( instance.https.url, 'https://localhost:8080' );
		} );

		it( 'preserves nested structure', () => {
			const A = design( () => ( { value: 'a' } ) );
			const B = design( () => ( { value: 'b' } ) );

			const Combined = compose( { x: A, y: B } );
			const instance = Combined.create();
			assert.ok( 'x' in instance );
			assert.ok( 'y' in instance );
			assert.equal( instance.x.value, 'a' );
			assert.equal( instance.y.value, 'b' );
		} );
	} );

	describe( 'composition with transformations', () => {
		it( 'allows with() on composed designs', () => {
			const Logger = design( ( deps: { prefix: string } ) => ( {
				log: ( msg: string ) => `[${deps.prefix}] ${msg}`
			} ) );

			const Timer = design( ( deps: { prefix: string } ) => ( {
				elapsed: () => `${deps.prefix}: 100ms`
			} ) );

			const Utilities = compose( [ Logger, Timer ] ).with( { prefix: 'INFO' } );
			const instance = Utilities.create();
			assert.equal( instance.log( 'test' ), '[INFO] test' );
			assert.equal( instance.elapsed(), 'INFO: 100ms' );
		} );

		it( 'allows extend() on composed designs', () => {
			const A = design( ( deps: { x: number } ) => ( { a: deps.x } ) );
			const B = design( ( deps: { x: number } ) => ( { b: deps.x } ) );

			const Combined = compose( [ A, B ] ).extend<{ y: number }>();
			const instance = Combined.create( { x: 1, y: 2 } );
			assert.equal( instance.a, 1 );
			assert.equal( instance.b, 1 );
		} );
	} );

	describe( 'composed as parent design', () => {
		it( 'allows composed designs as parents', () => {
			const Config = compose( {
				db: design( () => ( { host: 'localhost' } ) ),
				api: design( () => ( { port: 8080 } ) )
			} );

			const App = design( Config, ( config ) => ( {
				dbHost: config.db.host,
				apiPort: config.api.port
			} ) );

			const instance = App.create();
			assert.equal( instance.dbHost, 'localhost' );
			assert.equal( instance.apiPort, 8080 );
		} );

		it( 'passes parent dependencies to child', () => {
			const Parents = compose( {
				a: design( ( deps: { x: number } ) => ( { a: deps.x } ) ),
				b: design( ( deps: { x: number } ) => ( { b: deps.x } ) )
			} );

			const Child = design( Parents, ( parents ) => ( {
				sum: parents.a.a + parents.b.b
			} ) );

			const instance = Child.create( { x: 5 } );
			assert.equal( instance.sum, 10 );
		} );
	} );
} );
