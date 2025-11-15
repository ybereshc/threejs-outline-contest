import * as THREE from 'three';

export const createVisibleOutlineOverlay = ( renderer, scene, camera ) => {
	let targets = [];

	const update = () => {
		targets.length = 0;

		scene.traverse( ( object ) => {
			if ( !object.material || !object.geometry || !object.stroke ) return;
			targets.push( object );
		} );
	};

	let needsUpdate = true;

	const render = () => {
		if ( needsUpdate ) {
			update();
			needsUpdate = false;
		}
	};

	const dispose = () => {
	};

	return { render, update, dispose };
};
