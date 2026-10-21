import { createSystem, Vector3 } from '@iwsdk/core';
import * as THREE from 'three';
import { Marker } from './presence-components.js';
import { presenceStore } from '../presence/store.js';
import { bucketBearingCenterDeg, bucketDistanceCenterM } from '@urbaninversion/shared';

/**
 * SpatialDiscoverySystem: renders the presence layer from the store each
 * frame and reconciles Marker entities by handle (full-replacement marker
 * frames make departures implicit).
 *
 * Rendering rules (acceptance criteria):
 *  - OPEN markers: emissive green, oriented and distance-bucketed.
 *  - QUIET markers: dim gray-blue.
 *  - Nothing at all for coarse / OBSERVER / INVISIBLE / no markers.
 *  - Out-of-view markers on a narrow display become edge arrows at the FOV
 *    boundary instead of world-space spheres behind you.
 *
 * Placement math: the server's bearing bucket is geographic (clockwise from
 * north). userFacingGeo = cameraYawXr + alignmentOffset (walk-to-calibrate).
 * Relative azimuth = bucketBearing − userFacingGeo; direction in XR space
 * is (sin(rel), 0, −cos(rel)) so rel = 0 is dead ahead (−Z), matching the
 * heading provider's convention.
 */

const OPEN_COLOR = 0x2ecc71;
const QUIET_COLOR = 0x8a93a2;
const MARKER_HEIGHT_M = 1.4;
const EDGE_ARROW_DIST_M = 0.8;
const HALF_FOV_DEG = 22; // narrow monocular display; glanceable arc only
const SMOOTH_PER_SEC = 6;

export class SpatialDiscoverySystem extends createSystem({ markers: { required: [Marker] } }) {
	constructor() {
		super(...arguments);
		/** @type {Map<string, import('@iwsdk/core').Entity>} */
		this.entityByHandle = new Map();
		/** @type {Map<string, THREE.Group>} */
		this.groupByHandle = new Map();
		this.tmpForward = new Vector3();
		this.tmpCamPos = new Vector3();
	}

	init() {
		this.world.registerComponent(Marker);
		this.queries.markers.subscribe('disqualify', (entity) => {
			const handle = /** @type {string} */ (entity.getComponent(Marker)?.handle ?? '');
			this.destroyMarker(handle);
		});
	}

	/**
	 * @param {number} delta
	 */
	update(delta) {
		// Publish the tracked head pose for walk-to-calibrate.
		const head = this.player?.head;
		if (head) {
			head.updateWorldMatrix(true, false);
			this.tmpCamPos.setFromMatrixPosition(head.matrixWorld);
			presenceStore.setCameraPose({ x: this.tmpCamPos.x, y: this.tmpCamPos.y, z: this.tmpCamPos.z });
		}

		const status = presenceStore.getStatus();
		const shouldRender =
			status.state === 'open' || status.state === 'quiet' ? !status.coarse : false;
		const list = shouldRender ? presenceStore.getMarkers() : [];
		this.reconcileEntities(list);

		const now = Date.now();
		for (const marker of list) {
			const group = this.groupByHandle.get(marker.handle);
			if (!group || !head) continue;
			const target = this.targetPosition(marker, status.alignmentDeg);
			// Smooth marker motion between bucket updates.
			const t = 1 - Math.exp(-SMOOTH_PER_SEC * delta);
			group.position.lerp(target, t);
			group.userData.lastUpdate = now;
		}
	}

	destroy() {
		for (const handle of [...this.groupByHandle.keys()]) this.destroyMarker(handle);
		super.destroy();
	}

	/**
	 * @param {import('@urbaninversion/shared').MarkerEntry[]} list
	 */
	reconcileEntities(list) {
		const live = new Set(list.map((m) => m.handle));
		for (const handle of [...this.entityByHandle.keys()]) {
			if (!live.has(handle)) this.destroyMarker(handle);
		}
		for (const marker of list) {
			let entity = this.entityByHandle.get(marker.handle);
			if (!entity) {
				entity = this.createMarkerEntity(marker);
			}
			entity.setValue(Marker, 'state', marker.state);
			entity.setValue(Marker, 'distBucket', marker.dist);
			entity.setValue(Marker, 'brngBucket', marker.brng);
			entity.setValue(Marker, 'updatedAt', Date.now());
		}
	}

	/**
	 * @param {import('@urbaninversion/shared').MarkerEntry} marker
	 */
	createMarkerEntity(marker) {
		const entity = this.world.createTransformEntity();
		entity.addComponent(Marker, {
			handle: marker.handle,
			state: marker.state,
			distBucket: marker.dist,
			brngBucket: marker.brng,
			updatedAt: Date.now(),
		});
		const group = this.buildMarkerGroup(marker.state === 'open');
		entity.object3D.add(group);
		this.entityByHandle.set(marker.handle, entity);
		this.groupByHandle.set(marker.handle, group);
		return entity;
	}

	/**
	 * @param {boolean} open
	 * @returns {THREE.Group}
	 */
	buildMarkerGroup(open) {
		const group = new THREE.Group();
		const color = open ? OPEN_COLOR : QUIET_COLOR;
		const material = new THREE.MeshStandardMaterial({
			color,
			emissive: open ? color : 0x000000,
			emissiveIntensity: open ? 0.9 : 0,
			transparent: true,
			opacity: open ? 0.95 : 0.55,
		});
		const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), material);
		sphere.position.y = MARKER_HEIGHT_M;
		group.add(sphere);
		const ring = new THREE.Mesh(
			new THREE.RingGeometry(0.14, 0.17, 24),
			new THREE.MeshBasicMaterial({ color, transparent: true, opacity: open ? 0.8 : 0.3, side: THREE.DoubleSide })
		);
		ring.rotation.x = -Math.PI / 2;
		group.add(ring);
		return group;
	}

	/**
	 * @param {string} handle
	 */
	destroyMarker(handle) {
		const entity = this.entityByHandle.get(handle);
		const group = this.groupByHandle.get(handle);
		if (group) {
			group.traverse((obj) => {
				if (obj instanceof THREE.Mesh) {
					obj.geometry.dispose();
					const m = obj.material;
					if (Array.isArray(m)) m.forEach((x) => x.dispose());
					else m.dispose();
				}
			});
			group.parent?.remove(group);
		}
		this.groupByHandle.delete(handle);
		if (entity) {
			this.entityByHandle.delete(handle);
			entity.dispose();
		}
	}

	/**
	 * World-space target for a marker, including the edge-arrow clamp.
	 * @param {import('@urbaninversion/shared').MarkerEntry} marker
	 * @param {number} alignmentDeg
	 * @returns {THREE.Vector3}
	 */
	targetPosition(marker, alignmentDeg) {
		const head = this.player?.head;
		const out = new THREE.Vector3();
		if (!head) return out;
		head.updateWorldMatrix(true, false);
		out.setFromMatrixPosition(head.matrixWorld);

		// Camera yaw in the XR convention: 0 = -Z (forward), clockwise.
		this.tmpForward.set(0, 0, -1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
		const camYawDeg = (((Math.atan2(this.tmpForward.x, -this.tmpForward.z) * 180) / Math.PI) + 360) % 360;

		const userFacingGeo = camYawDeg + alignmentDeg;
		const bearingGeo = bucketBearingCenterDeg(marker.brng, this.markerCfg().bearingBucketDeg);
		let rel = bearingGeo - userFacingGeo;
		rel = ((rel % 360) + 360) % 360;
		if (rel > 180) rel -= 360;

		let dist = bucketDistanceCenterM(marker.dist, this.markerCfg().distanceBucketM);
		if (Math.abs(rel) > HALF_FOV_DEG) {
			// Out of view on the narrow display: an arrow at the FOV edge.
			rel = Math.sign(rel) * HALF_FOV_DEG;
			dist = EDGE_ARROW_DIST_M;
		}
		const rad = (rel * Math.PI) / 180;
		out.x += Math.sin(rad) * dist;
		out.z -= Math.cos(rad) * dist;
		return out;
	}

	/**
	 * Server bucket geometry arrives via hello-ack; until then use the
	 * package defaults (they match the deployed defaults).
	 * @returns {{ distanceBucketM: number, bearingBucketDeg: number }}
	 */
	markerCfg() {
		const s = presenceStore.getStatus();
		return {
			distanceBucketM: /** @type {number} */ (s.distanceBucketM ?? 10),
			bearingBucketDeg: /** @type {number} */ (s.bearingBucketDeg ?? 45),
		};
	}
}
