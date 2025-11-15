import * as THREE from 'three';
import {LineSegmentsGeometry} from "three/addons/lines/LineSegmentsGeometry.js";
import {Line2} from "three/addons/lines/Line2.js";
import {LineMaterial} from "three/addons/lines/LineMaterial.js";

const toWorldGeometry = ( mesh ) => {
	// гарантируем актуальные мировые матрицы для объекта и иерархии
	mesh.updateWorldMatrix( true, true ); // рекурсивно
	// world-geometry = локальная геометрия, умноженная на matrixWorld
	return mesh.geometry.clone().applyMatrix4( mesh.matrixWorld );
};

export const createVisibleOutlineOverlay = ( renderer, scene, camera ) => {
	let size = new THREE.Vector2();

	let targets = [];
	let edges = [];
	let map = new Map();

	let lineScene = new THREE.Scene();

	const update = () => {
		targets.length = 0;

		scene.traverse( ( object ) => {
			if ( !object.material || !object.geometry || !object.stroke ) return;

			let worldGeometry = toWorldGeometry( object );

			console.log(worldGeometry);

			let edgeGeo = new THREE.EdgesGeometry( worldGeometry );
			let lineGeo = new LineSegmentsGeometry().fromEdgesGeometry( edgeGeo );
			let lineMat = new LineMaterial( {
				linewidth: 2,
				color: 0xffffff,
				opacity: 1,
				transparent: false,
				side: THREE.DoubleSide,
			} );

			let line = new Line2( lineGeo, lineMat );

			line.matrixWorld

			lineScene.add( line );

			// line.computeLineDistances(); // важно

			line.raycast = () => {};
			line.renderOrder = 1;

			targets.push( object );
			edges.push( line );
		} );
	};

	let needsUpdate = true;

	const render = () => {
		if ( needsUpdate ) {
			update();
			needsUpdate = false;
		}

		// renderer.clearDepth( true );
		renderer.render( lineScene, camera );
	};

	const dispose = () => {
	};

	return { render, update, dispose };
};
