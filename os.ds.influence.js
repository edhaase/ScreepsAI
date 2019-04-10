/** os.ds.influence.js - Influence maps! */
'use strict';

const DEFAULT_MAX_INFLUENCE_DISTANCE = 15;

/**
 * Positive and negative influence?
 * Use two maps for accuracy?
 * 
 * The update is nice, but may need to rebuild from scratch if the map changes
 * or we miss an update.
 * 
 * http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter30_Modular_Tactical_Influence_Maps.pdf
 */
class InfluenceMap {
	constructor() {
		this.pending = {};
		this.data = {};
		this.influences = {};
		this.max_dist = DEFAULT_MAX_INFLUENCE_DISTANCE;
		// @todo If we're blocking propegation we should probably consult the ally list.
		this.blocks_propegation = (r) => Intel.isHostileRoom(r, false);
	}

	toString() {
		return `[InfluenceMap]`;
	}

	clone() {
		const copy = _.cloneDeep(this);
		return Object.setPrototypeOf(copy, this);
	}

	set(roomName, score) {
		if (!_.isEmpty(this.influences) && !_.any(this.influences, (v, k) => Game.map.getRoomLinearDistance(roomName, k, false) <= this.max_dist))
			return this; // Only add stuff we're going to care about.
		if (!this.influences[roomName])
			this.influences[roomName] = 0.0;
		const delta = score - this.influences[roomName];
		this.influences[roomName] = score;
		this.pending[roomName] = delta;
		return this;
	}

	add(roomName, score) {
		if (!_.isEmpty(this.influences) && !_.any(this.influences, (v, k) => Game.map.getRoomLinearDistance(roomName, k, false) <= this.max_dist))
			return this; // Only add stuff we're going to care about.
		if (!this.influences[roomName])
			this.influences[roomName] = 0.0;
		this.influences[roomName] += score;
		this.pending[roomName] = score;
		return this;
	}

	init() {
		this.pending = this.influences;
		return this.propegateAll();
	}

	*propegateAll() {
		const entries = Object.entries(this.pending);
		this.pending = {};
		for (const change of entries)
			yield* this.propegate(change);
		return this;
	}

	*propegate([origin, delta]) {
		const changes = {};
		const seen = {};
		const q = [origin];
		for (const roomName of q) {
			yield true;
			const dist = seen[roomName] || 0;
			if (dist >= this.max_range)
				continue;
			const inf = delta - (delta * (dist / this.max_dist));
			if (inf === 0)
				continue;
			changes[roomName] = inf;
			// if (this.blocks_propegation(roomName))	// Can't move through a hostile room directly.
			//	continue;
			const exits = _.values(Game.map.describeExits(roomName));
			for (const exit of exits) {
				if (!Game.map.isRoomAvailable(exit))
					continue;
				if (seen[exit] !== undefined && dist + 1 >= seen[exit])
					continue;
				seen[exit] = dist + 1;
				q.push(exit);
			}
		}

		for (const [roomName, change] of Object.entries(changes)) {
			yield true;
			if (!this.data[roomName])
				this.data[roomName] = 0.0;
			// this.data[roomName] += change;
			this.data[roomName] = _.round(this.data[roomName] + change, 5);
		}
	}

	report() {
		return _.mapValues(this.data, (v, k) => _.round(v, 3));
	}

	table(width = 35) {
		const entries = _.map(this.data, (v, k) => [ROOM_NAME_TO_COORD(k), v]);
		var lx = Infinity, ux = -Infinity, ly = Infinity, uy = -Infinity;
		for (const [[x, y]] of entries) {
			lx = Math.min(lx, x);
			ux = Math.max(ux, x);
			ly = Math.min(ly, y);
			uy = Math.max(uy, y);
		}
		console.log(`bounds ${lx} ${ly} ${ux} ${uy}`);

		var row, rows = "";
		for (var v = ly; v <= uy; v++) {
			row = "";
			for (var h = lx; h <= ux; h++) {
				const name = COORD_TO_ROOM_NAME(h, v);
				const score = _.round(this.data[name], 0) || '--';
				row += `<td>${score}</td>`;
			}
			rows += `<tr>${row}</td>`;
		}
		return `<table style='width: ${width}vw'>${rows}</table>`;
	}
}

InfluenceMap.test = function (first) {
	const im = new InfluenceMap();
	const owned = _.pick(Memory.intel, (v, k) => v.owner !== undefined);
	for (const mine of _.filter(Game.rooms, 'my'))
		im.set(mine.name, (mine.controller.level / 8) * 100);
	for (const [roomName, intel] of Object.entries(owned)) {
		const { owner } = intel;
		if (!owner || owner === WHOAMI)
			continue;
		const level = intel.level || 8;;
		im.set(roomName, -100 * (level / 8));
	}
	return im.init();
	/* im.set('W8N3', 50); // Maybe not _actually_ 100, but base on strength of room
	im.set('W7N2', 50);
	im.set('W7N4', 50);
	im.set('W1N1', -100);
	im.set('W9N1', -100);
	im.set('W9N9', -100);
	im.set('W1N9', -100);
	im.init();

	const b = new InfluenceMap();
	b.set('W8N3', 100);
	b.set('W7N4', 100);
	b.set('W1N1', -100);
	b.set('W9N1', -100);
	b.set('W1N9', -100);
	b.init();

	const c = im.clone();
	c.set('W9N9', 0);
	c.set('W7N2', 0);
	c.propegateAll();
	return [im, b, c]; */
};


module.exports = InfluenceMap;