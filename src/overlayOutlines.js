import * as THREE from 'three';

let _position = new THREE.Vector3();
let _quaternion = new THREE.Quaternion(); // Для вращения
let _scale = new THREE.Vector3();

const getSource = ( object ) => {
	object.matrixWorld.decompose( _position, _quaternion, _scale );

	return {
		level: _position.y,
		height: _scale.y,
		points: object.geometry.parameters.shapes.curves.slice( 0, -1 ).map( curve => curve.v1.clone() ),
	};
};

const getStyle = ( object ) => {
	return {
		color: object.stroke.color.clone(),
		hex: `#${ object.stroke.color.getHexString() }`,
		opacity: object.stroke.opacity,
		width: object.stroke.width,
	};
};

export const createVisibleOutlineOverlay = ( renderer, scene, camera ) => {
	const update = () => {
		scene.traverse( ( object ) => {
			if ( !object.material || !object.geometry || !object.stroke ) return;

			let source = getSource( object );
			let style = getStyle( object );

			console.log({ source,style });
		} );
	};

	let needsUpdate = true;

	const render = () => {
		if ( needsUpdate ) {
			update();
			needsUpdate = false;
		}

		// renderer.clearDepth( true );
		// renderer.render( lineScene, camera );
	};

	const dispose = () => {
	};

	return { render, update, dispose };
};
