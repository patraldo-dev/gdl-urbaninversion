// src/lib/location.svelte.js
// Global location state using Svelte 5 Runes
// Tracks user position and proximity to all GDL anchors

import { ANCHORS } from '$lib/anchors';

/** @typedef {{ lat: number, lon: number, accuracy: number }} UserPosition */

class LocationState {
    /** @type {UserPosition} */
    position = $state({ lat: 0, lon: 0, accuracy: 0 });

    /** @type {boolean} */
    watching = $state(false);

    /** @type {string|null} */
    nearbyAnchorId = $state(null);

    /** @type {number|null} distance in meters to nearest anchor */
    nearestDistance = $state(null);

    /** @type {number|null} */
    #watchId = null;

    constructor() {
        // Reactive: which anchor is nearby?
        $effect(() => {
            if (this.position.lat === 0) {
                this.nearbyAnchorId = null;
                this.nearestDistance = null;
                return;
            }

            let nearest = null;
            let nearestDist = Infinity;

            for (const anchor of ANCHORS) {
                const d = this.#haversineMeters(
                    this.position.lat, this.position.lon,
                    anchor.lat, anchor.lon
                );
                if (d < nearestDist) {
                    nearestDist = d;
                    nearest = anchor;
                }
            }

            this.nearestDistance = Math.round(nearestDist);
            this.nearbyAnchorId = nearestDist < 50 ? nearest?.id : null;
        });
    }

    /** Start watching position */
    startWatching() {
        if (this.#watchId !== null || typeof navigator === 'undefined') return;
        if (!navigator.geolocation) return;

        this.watching = true;
        this.#watchId = navigator.geolocation.watchPosition(
            (pos) => {
                this.position = {
                    lat: pos.coords.latitude,
                    lon: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                };
            },
            (err) => {
                console.warn('Geolocation:', err.message);
                this.watching = false;
            },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
        );
    }

    /** Stop watching */
    stopWatching() {
        if (this.#watchId !== null) {
            navigator.geolocation.clearWatch(this.#watchId);
            this.#watchId = null;
        }
        this.watching = false;
    }

    /** Check if near a specific anchor */
    isNear(anchorId, radiusM = 50) {
        if (this.position.lat === 0) return false;
        const anchor = ANCHORS.find(a => a.id === anchorId);
        if (!anchor) return false;
        return this.#haversineMeters(this.position.lat, this.position.lon, anchor.lat, anchor.lon) < radiusM;
    }

    /** Haversine distance in meters */
    #haversineMeters(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
}

// Singleton — shared across all components
export const locationState = new LocationState();
