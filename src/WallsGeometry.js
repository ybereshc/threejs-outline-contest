import * as THREE from 'three';

export default class WallsGeometry extends THREE.ExtrudeGeometry {
	constructor( shape, height = 1, curveSegments = 12 ) {
		const extrudeSettings = {
			depth: height,
			steps: 1,
			curveSegments,
			bevelEnabled: false
		};
		super( shape, extrudeSettings );
		this.type = 'WallsGeometry';

		const pos = this.attributes.position.array;
		const index = this.index ? this.index.array : null;

		if ( !index ) {
			this.setIndex( Array.from( { length: pos.length / 3 }, ( _, i ) => i ) );
		}

		const idx = this.index.array;
		const kept = [];

		// Вспомогательные вектора
		const a = new THREE.Vector3();
		const b = new THREE.Vector3();
		const c = new THREE.Vector3();
		const ab = new THREE.Vector3();
		const ac = new THREE.Vector3();
		const n = new THREE.Vector3();

		for ( let i = 0; i < idx.length; i += 3 ) {
			const i0 = idx[ i     ] * 3;
			const i1 = idx[ i + 1 ] * 3;
			const i2 = idx[ i + 2 ] * 3;

			a.set( pos[ i0 ], pos[ i0 + 1 ], pos[ i0 + 2 ] );
			b.set( pos[ i1 ], pos[ i1 + 1 ], pos[ i1 + 2 ] );
			c.set( pos[ i2 ], pos[ i2 + 1 ], pos[ i2 + 2 ] );

			ab.subVectors( b, a );
			ac.subVectors( c, a );
			n.crossVectors( ab, ac ).normalize();

			if ( Math.abs( n.z ) < 0.999 ) {
				kept.push( idx[ i + 0 ], idx[ i + 1 ], idx[ i + 2 ] );
			}
		}

		this.setIndex( kept );
		this.computeVertexNormals();

		this.clearGroups();
		if ( kept.length > 0 ) {
			this.addGroup( 0, kept.length, 0 );
		}
	}
}
