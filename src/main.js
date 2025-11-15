import './style.css'
import * as THREE from 'three';
import Stats from 'stats.js';
import { GUI } from 'lil-gui';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createVisibleOutlineOverlayBasic } from './overlayOutlinesBasic.js';
import { createVisibleOutlineOverlay } from './overlayOutlines.js';
import WallsGeometry from './WallsGeometry.js';
import data from './data.js';

////////////////////////////////////////////////////////

let placeEl = document.getElementById( 'place' );

const getLCGRandom = ( seed = 1 ) => {
	getLCGRandom._seed ??= seed >>> 0; // привести к uint32
	getLCGRandom._seed = (getLCGRandom._seed * 214013 + 2531011) >>> 0; // mod 2^32 автоматически
	let value = (getLCGRandom._seed >>> 16) & 0x7FFF; // 15 бит
	return value / 0x7FFF; // нормализуем в [0,1]
};

Math.random = getLCGRandom.bind();

const getRandom = () => {
	return getLCGRandom( 42 );
	// return getLCGRandom( Date.now() );
	// return Math.random();
};

const appendStroke = ( target, params ) => {
	let { color = 0xffffff, opacity = 1, width = 1 } = params;

	target.stroke = {
		color,
		opacity,
		width,
	};

	return target;
};

const DEPTH_MATERIAL = new THREE.MeshBasicMaterial( { colorWrite: false } );

let basicFillOpacity = 0.2;
let basicStrokeOpacity = 1.0;
let basicStrokeWidth = 1;

const getParams = ( parameters ) => {
	parameters ??= {};
	parameters.color ??= 0xffffff;
	parameters.fillColor ??= parameters.color;
	parameters.fillOpacity ??= basicFillOpacity;
	parameters.strokeColor ??= parameters.color;
	parameters.strokeOpacity ??= basicStrokeOpacity;
	parameters.strokeWidth ??= basicStrokeWidth;

	return parameters;
};

const createMesh = ( geometry, parameters ) => {
	parameters = getParams( parameters );

	let mesh = new THREE.Mesh(
		geometry,
		new THREE.MeshBasicMaterial({
			color: parameters.fillColor,
			opacity: parameters.fillOpacity,
			transparent: true,
		}),
	);

	let depthMesh = new THREE.Mesh( geometry, DEPTH_MATERIAL );

	depthMesh.raycast = () => {};

	depthMesh.renderOrder = -2;

	mesh.add( depthMesh );

	appendStroke( mesh, {
		width: parameters.strokeWidth,
		opacity: parameters.strokeOpacity,
		color: parameters.strokeColor,
	} );

	return mesh;
};

const createPlacement = ( shape, parameters ) => {
	parameters = getParams( parameters );

	shape = shape.isShape ? shape : new THREE.Shape( shape );

	let mesh = new THREE.Mesh(
		new WallsGeometry( shape ),
		new THREE.MeshBasicMaterial({
			color: parameters.fillColor,
			opacity: parameters.fillOpacity,
			transparent: true,
		} ),
	);

	let depthGeometry = new THREE.ExtrudeGeometry( shape, { bevelEnabled: false } );
	let depthMesh = new THREE.Mesh( depthGeometry, DEPTH_MATERIAL );

	mesh.getGeometry = ( callback ) => {
		if ( callback ) {
			callback( mesh.geometry );
			callback( depthMesh.geometry );
		} else {
			return [ mesh.geometry, depthMesh.geometry ];
		}
	}

	depthMesh.raycast = () => {};
	depthMesh.renderOrder = -2;

	mesh.add( mesh.depthMesh = depthMesh );
	// mesh.depthMesh = depthMesh;

	appendStroke( mesh, {
		width: parameters.strokeWidth,
		opacity: parameters.strokeOpacity,
		color: parameters.strokeColor,
	} );

	return mesh;
};

let bgScene = new THREE.Scene();
let scene = new THREE.Scene();

let renderer = new THREE.WebGLRenderer( { antialias: true } );
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(placeEl.clientWidth, placeEl.clientHeight);
renderer.autoClear = false;
placeEl.appendChild(renderer.domElement);

let camera = new THREE.PerspectiveCamera(45, placeEl.clientWidth / placeEl.clientHeight, 0.1, 10000);
camera.position.set(3.5, 5, 7.5);

let outlineOverlay = null;

let controls = new OrbitControls( camera, renderer.domElement );
controls.mouseButtons = {
	LEFT: THREE.MOUSE.ROTATE,
	MIDDLE: THREE.MOUSE.PAN,
	RIGHT: null,
};
controls.enableDamping = true;
renderer.domElement.addEventListener('contextmenu', ( ev ) => ev.preventDefault = () => {}, true );

let loader = new THREE.TextureLoader();
loader.load(`/pano.jpg`, texture => {
	texture.mapping = THREE.EquirectangularReflectionMapping;
	texture.encoding = THREE.sRGBEncoding;

	// Создаем сферу с панорамой внутри
	let geometry = new THREE.SphereGeometry(5000, 60, 40);
	geometry.scale(-1, 1, 1); // инвертируем нормали, чтобы смотреть изнутри

	let material = new THREE.MeshBasicMaterial({ map: texture });
	let mesh = new THREE.Mesh(geometry, material);
	bgScene.add(mesh);
});

const changeAny = ( append ) => {
	scene.remove( scene.getObjectByName( 'any' ) );

	if ( !append ) {
		return;
	}

	const group = new THREE.Group();
	group.name = 'any';

	const box = createMesh(
		new THREE.BoxGeometry(2.2, 2.8, 1.2),
		{ color:0xff0000, opacity:0.5 }
	);
	box.position.set(-0.6, 0.6, 0.2);
	group.add(box);

	const sphere = createMesh(
		new THREE.SphereGeometry(1.4, 48, 32),
		{ color:0x0000ff, opacity:0.5 }
	);
	sphere.position.set(0.9, -0.2, 0.9);
	group.add(sphere);

	const cylinder = createMesh(
		new THREE.CylinderGeometry(0.9, 0.9, 2.2, 48),
		{ color:0x00ff00, opacity:0.5 }
	);
	cylinder.rotation.z = Math.PI/8;
	cylinder.position.set(1.8, 0.7, -0.6);
	group.add(cylinder);

	const knot = createMesh(
		new THREE.TorusKnotGeometry(0.7, 0.24, 120, 20),
		{ color:0xffff00, opacity:0.5 }
	);
	knot.position.set(-1.8, -0.4, -0.4);
	group.add(knot);

	scene.add( group );
};

const changeWalls = ( append ) => {
	scene.remove( scene.getObjectByName( 'walls' ) );

	if ( !append ) {
		return;
	}

	const group = new THREE.Group( { name: 'walls' } );
	group.name = 'walls';

	let { shapes, multiply } = data;

	let MAX_COLORS = 72;

	shapes.forEach( ( data ) => {
		let mesh = createPlacement( data.points.map( ( [ x, y ] ) => new THREE.Vector2( x, y ) ), {
			color: new THREE.Color( `hsl(${ ( MAX_COLORS * getRandom() | 0 ) * ( 360 / MAX_COLORS ) }, 100%, 50%)` ),
		} );

		mesh.getGeometry( ( geometry ) => {
			geometry.rotateX( -Math.PI / 2 );
			geometry.rotateY( Math.PI );
		} );

		mesh.userData.placementId = data.placementId;
		mesh.userData.isTerrace = data.isTerrace;

		mesh.position.y = data.level * multiply;
		mesh.scale.y = data.height * multiply;

		group.add( mesh );
	} );

	scene.add( group );
};

const changeBox = ( append ) => {
	scene.remove( scene.getObjectByName( 'box' ) );

	if ( !append ) {
		return;
	}

	const group = new THREE.Group( { name: 'box' } );
	group.name = 'box';

	let boxPoints = [
		[ -.5, -.5 ],
		[ -.5, .5 ],
		[ .5, .5 ],
		[ .5, -.5 ],
	];

	let box = createPlacement( boxPoints.map( ( [ x, y ] ) => new THREE.Vector2( x, y ) ), {
		color: new THREE.Color( 0xeeeeee ),
	} );

	box.getGeometry( ( geometry ) => {
		geometry.rotateX( -Math.PI / 2 );
		geometry.rotateY( Math.PI );
	} );

	group.add( box );
	scene.add( group );
};

let raycaster = new THREE.Raycaster();
let pointer = new THREE.Vector2();

const updatePointer = ( ev ) => {
	pointer.x = ( ev.clientX / window.innerWidth ) * 2 - 1;
	pointer.y = - ( ev.clientY / window.innerHeight ) * 2 + 1;
	return pointer;
};

window.addEventListener( 'pointermove', ( ev ) => {
	updatePointer( ev );
} );

window.addEventListener( 'dblclick', ( ev ) => {
	updatePointer( ev );

	const intersect = raycaster.intersectObject( scene, true )[ 0 ];

	if ( intersect ) {
		console.log(intersect);
	}
} );

let lastHover = null;

const stats = new Stats();
stats.showPanel( 0 ); // 0: FPS
placeEl.appendChild( stats.dom );

// GUI
const params = {
	walls: true,
	any: false,
	box: false,
	fillOpacity: basicFillOpacity,
	strokeOpacity: basicStrokeOpacity,
	strokeWidth: basicStrokeWidth,
	rotate: true,
	basic: true,
	background: true,
};

const gui = new GUI( { width: 240 } );

gui.onChange( () => {
	localStorage.setItem( 'params', JSON.stringify( params ) );
} );

try {
	Object.assign( params, JSON.parse( localStorage.getItem( 'params' ) ) );
} finally {}

const groupObjects = gui.addFolder( 'Objects' );

let objectWalls = groupObjects
	.add( params, 'walls' )
	.onChange( changeWalls );

let objectAny = groupObjects
	.add( params, 'any' )
	.onChange( changeAny );

let objectBox = groupObjects
	.add( params, 'box' )
	.onChange( changeBox );

const groupStyle = gui.addFolder( 'Style' );

let styleFillOpacity = groupStyle
	.add( params, 'fillOpacity', 0.0, 1.0, 0.1 )
	.name( 'Fill opacity' )
	.onChange( ( value ) => {
		basicFillOpacity = value;

		scene.traverse( ( object ) => {
			if ( object.material?.transparent ) {
				object.material.opacity = value;
			}
		} );
	} );

let styleStrokeOpacity = groupStyle
	.add( params, 'strokeOpacity', 0.0, 1.0, 0.1 )
	.name( 'Stroke opacity' )
	.onChange( ( value ) => {
		basicStrokeOpacity = value;

		scene.traverse( ( object ) => {
			if ( object.stroke ) {
				object.stroke.opacity = value;
			}
		} );
	} );

let styleStrokeWidth = groupStyle
	.add( params, 'strokeWidth', 0.0, 10, 0.1 )
	.name( 'Stroke width' )
	.onChange( ( value ) => {
		basicStrokeWidth = value;

		scene.traverse( ( object ) => {
			if ( object.stroke ) {
				object.stroke.width = value;
			}
		} );
	} );

const groupBehavior = gui.addFolder( 'Behavior' );

groupBehavior
	.add( params, 'background' )
	.name( 'Background' )

groupBehavior
	.add( params, 'rotate' )
	.name( 'Rotate' )

let behaviorBasic = groupBehavior
	.add( params, 'basic' )
	.name( 'Basic' )
	.onChange( v => {
		outlineOverlay?.dispose?.();

		if ( v ) {
			outlineOverlay = createVisibleOutlineOverlayBasic( renderer, scene, camera );
		} else {
			outlineOverlay = createVisibleOutlineOverlay( renderer, scene, camera );
		}
	} );

gui.add( { reset: () => {
	localStorage.removeItem( 'params' );
	location.reload();
} }, 'reset' ).name( 'Reset' );

groupObjects.open();
groupStyle.open();
groupBehavior.open();

[ objectWalls, objectAny, objectBox, styleFillOpacity, styleStrokeOpacity, styleStrokeWidth, behaviorBasic ].forEach( el => {
	el._onChange?.( el.getValue() );
} );

const animate = () => {
	requestAnimationFrame( animate );

	let blink = ( Date.now() / 500 | 0 ) % 2 === 0;

	if ( params.basic || behaviorBasic.$name.style.color ) {
		behaviorBasic.$name.style.color = blink ? 'red' : '';
	}

	raycaster.setFromCamera(pointer, camera);

	const intersects = raycaster.intersectObject(scene, true);
	let currHover = intersects[ 0 ]?.object ?? null;

	if ( lastHover ) {
		lastHover.stroke.color = lastHover.stroke._color;
		lastHover.renderOrder = 0;
		lastHover = null;
	}

	if ( currHover?.stroke ) {
		currHover.stroke._color = currHover.stroke.color;
		currHover.stroke.color = 0xffffff;
		currHover.renderOrder = 1;
		lastHover = currHover;
	}

	if ( params.rotate ) {
		scene.children.forEach( child => {
			child.rotation.y += 0.005;
		} )
	}

	controls.update();
	renderer.clear();

	if ( params.background ) {
		renderer.render(bgScene, camera);
	}

	renderer.render(scene, camera);
	// renderer.clear();

	stats.begin();
	outlineOverlay?.render();
	stats.end();
};

animate();

window.addEventListener('keydown', ( ev ) => {
	if ( outlineOverlay?.update && ev.code === 'Space' ) {
		outlineOverlay?.update();
	}
});

window.addEventListener('resize', () => {
	camera.aspect = placeEl.clientWidth / placeEl.clientHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(placeEl.clientWidth, placeEl.clientHeight);
});

