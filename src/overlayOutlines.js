import * as THREE from 'three';

export const createVisibleOutlineOverlay = ( renderer, scene, camera ) => {
	const update = () => {
		// detect outline
	};

	const render = () => {
		update(); // comment this call, and use Space key for call update manually

		// render
	};

	const dispose = () => {
	};

	return { render, update, dispose };
};
