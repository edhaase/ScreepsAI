/**
 * Unit.js
 *
 * Reoccuring unit management
 */
"use strict";

const Arr = require('Arr');

const MAX_RCL_UPGRADER_SIZE = UNIT_COST([MOVE, MOVE, MOVE, CARRY]) + BODYPART_COST[WORK] * CONTROLLER_MAX_UPGRADE_PER_TICK * UPGRADE_CONTROLLER_POWER;

const MINING_BODIES = [
	// [WORK,WORK,WORK,WORK,WORK,WORK,CARRY,MOVE,MOVE,MOVE],
	[WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE],
	[WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE],
	[WORK, WORK, WORK, WORK, WORK, MOVE],
	[WORK, WORK, WORK, WORK, MOVE],
	[WORK, WORK, WORK, MOVE],
	[WORK, WORK, MOVE]
];

const REMOTE_MINING_BODIES = [
	// [WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,MOVE,MOVE,MOVE],
	[WORK, WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE],
	[WORK, WORK, WORK, WORK, WORK, MOVE, MOVE],
	[WORK, WORK, WORK, WORK, MOVE],
	[WORK, WORK, WORK, MOVE],
	[WORK, WORK, MOVE]
];

global.MAX_MINING_BODY = (amt) => _.find(MINING_BODIES, b => UNIT_COST(b) <= amt);

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/from
// Unit.Body.from([WORK,CARRY,MOVE]).sort() -- confirmed to work
class Body extends Array {
	/** override push to limit size */
	push(part) {
		if (this.length >= MAX_CREEP_SIZE)
			throw new Error(`Creep body is limited to ${MAX_CREEP_SIZE} parts`);
		return super.push(part);
	}

	/** override fill to limit size */
	fill(value, start = 0, end = this.length) {
		return super.fill(value, start, Math.min(MAX_CREEP_SIZE, end));
	}

	/** override unshift to limit size */
	unshift(...args) {
		if (args.length + this.length > MAX_CREEP_SIZE)
			throw new Error(`Creep body is limited to ${MAX_CREEP_SIZE} parts`);
		return super.unshift.apply(this, args);
	}

	concat(...args) {
		return super.concat.apply(this, args);
	}

	cost() {
		return _.sum(this, p => BODYPART_COST[p]);
	}

	ticks() {
		return this.length * CREEP_SPAWN_TIME;
	}

	getCounts() {
		return _.countBy(this);
	}

	sort() {
		return _.sortBy(this, p => _.indexOf([TOUGH, MOVE, WORK, CARRY, ATTACK, RANGED_ATTACK, HEAL, CLAIM], p));
	}

}

global.Body = Body;

module.exports = {
	Body: Body,

	listAges: () => _.map(Game.creeps, c => Game.time - c.memory.born),
	oldestCreep: () => _.max(Game.creeps, c => Game.time - c.memory.born),

	/**
	 * Sort a creep body so that 1 of each part (except tough)
	 * ends up on the end, then sorts as normal. 
	 */
	tailSort(body) {
		var first = {};
		var order = [TOUGH, MOVE, WORK, CARRY, RANGED_ATTACK, ATTACK, CLAIM, HEAL];
		return _.sortBy(body, function (part) {
			if (part !== TOUGH && first[part] === undefined) {
				first[part] = false;
				return 1000 - order.indexOf(part); // Arbritarly large number.
			} else {
				return order.indexOf(part);
			}
		});
	},

	sort: body => _.sortBy(body, p => _.indexOf([TOUGH, MOVE, WORK, CARRY, ATTACK, RANGED_ATTACK, HEAL, CLAIM], p)),

	shuffle: function (body) {
		if (body == null)
			return undefined;
		return _(body)
			.sortBy(function (part) {
				if (part === TOUGH)
					return 0;
				else if (part === HEAL)
					return BODYPARTS_ALL.length;
				else
					return _.random(1, BODYPARTS_ALL.length - 1);
			})
			.value();
	},

	/**
	 * Repeat a part cost until we hit max cost, or reach 50 parts.
	 */
	repeat: function (arr, max) {
		console.log('Unit.repeat is deprecated');
		return Arr.repeat(arr, max);
	},

	requestRemoteMiner: function (spawn, pos, work = SOURCE_HARVEST_PARTS, room) {
		const body = _.find(REMOTE_MINING_BODIES, b => UNIT_COST(b) <= spawn.room.energyCapacityAvailable && _.sum(b, bp => bp === WORK) <= work);
		const cost = UNIT_COST(body);
		if (!body || !body.length)
			return;
		spawn.submit({
			body,
			memory: { role: 'miner', dest: pos, travelTime: 0 },
			priority: 75,
			room,
			expire: DEFAULT_SPAWN_JOB_EXPIRE
		});
	},

	/**
	 * Request miner
	 */
	requestMiner: function (spawn, dest, priority = 8) {
		const body = _.find(MINING_BODIES, b => UNIT_COST(b) <= spawn.room.energyCapacityAvailable);
		spawn.submit({ body, memory: { role: 'miner', dest: dest, home: dest.roomName, travelTime: 0 }, priority, expire: DEFAULT_SPAWN_JOB_EXPIRE });
	},

	/**
	 * Biggest we can! Limit to 15 work parts
	 * requestUpgrader(firstSpawn,1,5,49)
	 */
	requestUpgrader: function (spawn, home, priority = 3, max = 2500) {
		var body = [];
		// energy use is  active work * UPGRADE_CONTROLLER_POWER, so 11 work parts is 11 ept, over half a room's normal production
		const { controller, storage } = spawn.room;
		if (controller.level <= 2) {
			body = [CARRY, MOVE, WORK, WORK];
		} else {
			if (controller.level === MAX_ROOM_LEVEL)
				max = Math.min(max, MAX_RCL_UPGRADER_SIZE);
			else if (storage)
				max = Math.min(BODYPART_COST[WORK] * Math.floor(10 * storage.stock), max); // Less than 20 ept.
			// Ignore top 20% of spawn energy (might be in use by renewels)
			var avail = Math.clamp(250, spawn.room.energyCapacityAvailable - (SPAWN_ENERGY_CAPACITY * 0.20), max);
			var count = Math.floor((avail - 300) / BODYPART_COST[WORK]);
			let ccarry = 1;
			if (count > 5) {
				ccarry += 2;
				count -= 2;
			}
			body = Util.RLD([ccarry, CARRY, 1, WORK, count, WORK, 3, MOVE]);
		}
		return spawn.submit({ body, memory: { role: 'upgrader', home }, priority });
	},

	requestWarMiner: function (spawn, memory, room) {
		if (!memory)
			throw new Error('argument 2 memory cannot be null');
		const body = Util.RLD([9, WORK, 19, MOVE, 1, CARRY, 3, RANGED_ATTACK, 13, ATTACK, 4, HEAL, 1, MOVE]); // Cost: 4440
		return spawn.submit({ body, memory, priority: 10, room: room || spawn.pos.roomName });
	},

	/**
	 * Biggest we can!
	 * WARNING: _5_ energy per tick per part, not 1.
	 */
	requestBuilder: function (spawn, { elimit = 20, home, body, num = 1, priority = 0 } = {}) {
		// let avail = Math.clamp(300, spawn.room.energyCapacityAvailable, 2000);
		const partLimit = Math.floor(elimit / BUILD_POWER);
		const avail = Math.max(SPAWN_ENERGY_START, spawn.room.energyCapacityAvailable * 0.80);
		const pattern = [MOVE, MOVE, MOVE, WORK, WORK, CARRY];
		const cost = UNIT_COST(pattern);
		const al = Math.min(Math.floor(cost * (partLimit / 2)), avail);
		// console.log(`Pattern cost: ${cost}, avail: ${avail}, limit: ${al}`);
		if (body == null)
			body = Arr.repeat(pattern, al); // 400 energy gets me 2 work parts.
		if (_.isEmpty(body)) {
			body = [WORK, CARRY, MOVE, MOVE];
		}
		return spawn.submit({ body, memory: { role: 'builder', home }, priority });
	},

	requestBulldozer: function (spawn, roomName) {
		const body = [WORK, WORK, MOVE, MOVE];
		return spawn.submit({ body, memory: { role: 'bulldozer', site: roomName }, priority: 10 });
	},

	requestDualMiner: function (spawn, home, totalCapacity, steps) {
		const size = Math.ceil(totalCapacity / HARVEST_POWER / (ENERGY_REGEN_TIME - steps)) + 1; // +2 margin of error
		Log.info(`Dual mining op has ${totalCapacity} total capacity`, 'Controller');
		Log.info(`Dual mining op wants ${size} harvest parts`, 'Controller');

		const body = Util.RLD([
			size, WORK,
			1, CARRY,
			Math.ceil((1 + size) / 2), MOVE
		]);
		if (body.length > 50) {
			Log.warn('[Controller] Body of creep would be too big to build');
			return false;
		}
		const cost = UNIT_COST(body);
		if (spawn.room.energyCapacityAvailable < cost) {
			Log.warn('[Controller] Body of creep is too expensive for the closest spawn');
			return false;
		}
		var priority = (spawn.pos.roomName === home) ? 50 : 10;
		return spawn.submit({ body, memory: { role: 'dualminer', site: home }, priority, home });
	},

	/**
	 * Biggest we can!
	 */
	requestRepair: function (spawn, home, maxAvail = Infinity, priority = 10) {
		const avail = Math.clamp(400, spawn.room.energyCapacityAvailable, maxAvail);
		// var body = this.repeat([WORK,CARRY,MOVE,MOVE], avail);
		// var body = this.repeat([WORK,WORK,CARRY,MOVE,MOVE,MOVE], avail);
		var body = Arr.repeat([MOVE, MOVE, MOVE, WORK, WORK, CARRY], avail);
		return spawn.submit({ body, memory: { role: 'repair', home }, priority, expire: DEFAULT_SPAWN_JOB_EXPIRE });
	},

	requestHapgrader: function (spawn, site) {
		const body = [WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, MOVE];
		const memory = { role: 'hapgrader', site: site }
		return spawn.submit({ body, memory, priority: 10 });
	},

	requestScav: function (spawn, home = null, canRenew = true, priority = 50, hasRoad = true) {
		var memory = {
			role: 'scav',
			type: 'ext-filler',
			eca: spawn.room.energyCapacityAvailable
		};
		if (canRenew === false)
			memory.bits = BIT_CREEP_DISABLE_RENEW;

		memory.home = home || spawn.pos.roomName;

		// let capacity = spawn.room.energyCapacityAvailable;
		// reduce max size so we don't need a "full" room, which seems rare
		let capacity = Math.ceil(spawn.room.energyCapacityAvailable * 0.75);
		if (home !== spawn.pos.roomName)
			capacity /= 2; // Smaller scavs in remote rooms.
		// var body, avail = Math.clamp(250, capacity, 1500) - BODYPART_COST[WORK];
		var body, avail = Math.clamp(250, capacity, 1500) - UNIT_COST([WORK, MOVE]);
		if (hasRoad)
			body = Arr.repeat([CARRY, CARRY, MOVE], avail);
		else
			body = Arr.repeat([CARRY, MOVE], avail);
		body.unshift(WORK);
		body.unshift(MOVE);
		if (!body || body.length <= 3) {
			console.log("Unable to build scav");
		} else {
			return spawn.submit({ body, memory, priority, home });
		}
	},

	requestClaimer: function (spawn) {
		const body = [CLAIM, MOVE];
		let cost = UNIT_COST(body);
		while (cost < spawn.room.energyCapacityAvailable && body.length < 6) {
			body.push(MOVE);
			cost += BODYPART_COST[MOVE];
		}
		return spawn.submit({ body, memory: { role: 'claimer', } });
	},

	requestScout: function (spawn, memory = { role: 'scout' }) {
		return spawn.submit({ body: [MOVE], memory, priority: 75 });
	},

	requestDefender: function (spawn, roomName, priority = 75) {
		let body = Arr.repeat([TOUGH, ATTACK, MOVE, MOVE], spawn.room.energyCapacityAvailable / 2);
		// let body = this.repeat([RANGED_ATTACK, MOVE], spawn.room.energyCapacityAvailable / 2);
		if (_.isEmpty(body))
			body = [MOVE, ATTACK];
		return spawn.submit({ body, memory: { role: 'defender', home: roomName }, priority });
	},

	requestRanger: function (spawn, roomName, priority = 75) {
		const body = Arr.repeat([RANGED_ATTACK, MOVE], spawn.room.energyCapacityAvailable / 2);
		return spawn.submit({ body, memory: { role: 'defender', home: roomName }, priority });
	},

	requestPilot: function (spawn, roomName, count = 1) {
		const MAX_PILOT_ENERGY = 750;
		const amt = Math.clamp(SPAWN_ENERGY_START, spawn.room.energyAvailable, MAX_PILOT_ENERGY);
		const body = Arr.repeat([WORK, CARRY, MOVE, MOVE], amt);
		return spawn.submit({ body, memory: { role: 'pilot', home: roomName || spawn.pos.roomName }, priority: 100 });
	},

	requestMineralHarvester(spawn, site, cid) {
		const body = Arr.repeat([WORK, WORK, MOVE], spawn.room.energyCapacityAvailable);
		const memory = { role: 'harvester', site, cid };
		return spawn.submit({ body, memory, priority: 10 });
	},

	requestReserver: function (spawn, site, priority = 25) {
		if (!site)
			throw new Error('site can not be empty!');
		const avail = spawn.room.energyCapacityAvailable;
		const body = Arr.repeat([MOVE, CLAIM], Math.min(avail, 6500));
		if (_.isEmpty(body))
			return ERR_RCL_NOT_ENOUGH;
		else
			return spawn.submit({ body, memory: { role: 'reserver', site }, priority });
	},

	requestHauler: function (spawn, memory, hasRoad = false, reqCarry = Infinity, priority = 10, room) {
		var avail = Math.max(SPAWN_ENERGY_START, spawn.room.energyCapacityAvailable) - 250;
		var body;
		if (!hasRoad) {
			const howMuchCanWeBuild = Math.floor(avail / 100); // this.cost([CARRY,MOVE]);
			const howMuchDoWeWant = Math.ceil(reqCarry);
			let howCheapCanWeBe = Math.min(howMuchDoWeWant, howMuchCanWeBuild) * 100;
			howCheapCanWeBe = Math.max(UNIT_COST([WORK, WORK, MOVE, CARRY, MOVE]), howCheapCanWeBe);
			body = [WORK, WORK, MOVE].concat(Arr.repeat([CARRY, MOVE], howCheapCanWeBe));
		} else {
			const cost = UNIT_COST([CARRY, CARRY, MOVE]);
			const howMuchCanWeBuild = Math.floor(avail / cost); // this.cost([CARRY,CARRY,MOVE]);
			const howMuchDoWeWant = Math.ceil(reqCarry);
			// console.log(reqCarry);
			let howCheapCanWeBe = Math.min(howMuchDoWeWant, howMuchCanWeBuild) * (cost / 2);
			howCheapCanWeBe = Math.max(UNIT_COST([WORK, WORK, MOVE, CARRY, CARRY, MOVE]), howCheapCanWeBe);
			howCheapCanWeBe = Math.min(howCheapCanWeBe, 2200); // capped to 48 parts, and room for work/move
			Log.info(`Want: ${howMuchDoWeWant}, Avail: ${howMuchCanWeBuild}, How Cheap: ${howCheapCanWeBe}`, 'Creep');
			body = [WORK, WORK, MOVE].concat(Arr.repeat([CARRY, CARRY, MOVE], howCheapCanWeBe));
		}
		const cost = UNIT_COST(body);
		if (cost > spawn.room.energyCapacityAvailable)
			return;
		return spawn.submit({ body, memory, priority, room });
	},

	requestFireTeam: function (s1, s2) {
		this.requestHealer(s1);
		this.requestHealer(s2);
		this.requestAttacker(s1);
		this.requestAttacker(s2);
		this.requestAttacker(s1);
		this.requestAttacker(s2);
	},

	requestPowerBankTeam: function (s1, s2) {
		let b1 = Arr.repeat([MOVE, HEAL], s1.room.energyCapacityAvailable);
		let b2 = Arr.repeat([MOVE, HEAL], s2.room.energyCapacityAvailable);
		this.requestHealer(s1, b1);
		this.requestHealer(s1, b1);
		this.requestHealer(s2, b2);
		this.requestAttacker(s1);
		this.requestAttacker(s2);
	},

	requestHealer: function (spawn, roomName, priority = 50) {
		const body = Arr.repeat([MOVE, HEAL], spawn.room.energyCapacityAvailable / 2);
		if (_.isEmpty(body))
			return null;
		return spawn.submit({ body, memory: { role: 'healer', home: roomName }, priority });
	},

	// Unit.requestGuard(Game.spawns.Spawn1, 'Guard2', Unit.repeat([MOVE,ATTACK],3000).sort())
	// [MOVE,MOVE,RANGED_ATTACK,MOVE,MOVE,HEAL,HEAL]	
	// Unit.requestGuard(Game.spawns.Spawn1, 'Guard', [TOUGH,TOUGH,MOVE,MOVE,RANGED_ATTACK,MOVE,HEAL,HEAL,HEAL])
	// Unit.requestGuard(Game.spawns.Spawn1, 'Guard', [TOUGH,TOUGH,TOUGH,TOUGH,MOVE,MOVE,ATTACK,MOVE,ATTACK,MOVE,MOVE,ATTACK,ATTACK,HEAL,HEAL,HEAL,HEAL])
	// Unit.requestGuard(Game.spawns.Spawn1, 'Guard', [TOUGH,TOUGH,TOUGH,TOUGH,MOVE,MOVE,MOVE,MOVE,RANGED_ATTACK,RANGED_ATTACK,MOVE,MOVE,HEAL,HEAL,HEAL])
	// Unit.requestGuard(Game.spawns.Spawn1, 'Guard', Util.RLD([13,MOVE,4,RANGED_ATTACK,3,HEAL]))
	// Unit.requestGuard(Game.spawns.Spawn1, 'Test', [MOVE,HEAL,MOVE,HEAL,MOVE,HEAL,MOVE,HEAL,MOVE,HEAL,MOVE,HEAL,MOVE,HEAL,MOVE,HEAL,MOVE,HEAL,MOVE,HEAL,MOVE,HEAL,MOVE,HEAL,MOVE,ATTACK,MOVE,ATTACK])
	// Unit.requestGuard(Game.spawns.Spawn4, 'Guard2', [TOUGH,TOUGH,MOVE,MOVE,RANGED_ATTACK,RANGED_ATTACK,MOVE,MOVE,HEAL,HEAL,HEAL])
	// Unit.requestGuard(Game.spawns.Spawn4, 'Guard2', [MOVE,ATTACK,MOVE,ATTACK,MOVE,ATTACK,MOVE,ATTACK,MOVE,ATTACK,MOVE,ATTACK,MOVE,ATTACK])
	// Unit.requestGuard(Game.spawns.Spawn2, 'Flag31', Util.RLD([10,TOUGH,20,MOVE,10,ATTACK]))
	// Unit.requestGuard(Game.spawns.Spawn8, 'Flag38', Util.RLD([5,TOUGH,10,MOVE,6,ATTACK]))
	// Unit.requestGuard(Game.spawns.Spawn4, 'Guard2', Util.RLD([5,TOUGH,20,MOVE,5,RANGED_ATTACK,2,HEAL]))
	// requestGuard: function(spawn, flag, body=[MOVE,MOVE,RANGED_ATTACK,HEAL]) {
	requestGuard: function (spawn, flag, body = [TOUGH, TOUGH, MOVE, MOVE, MOVE, ATTACK, MOVE, ATTACK, MOVE, ATTACK], room) {
		if (!flag || !(Game.flags[flag] instanceof Flag))
			throw new TypeError("Expected flag");
		return spawn.submit({ body, memory: { role: 'guard', site: flag }, priority: 100, room	});
	}
};
