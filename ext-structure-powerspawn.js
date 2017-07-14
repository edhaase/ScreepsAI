/**
 * ext-structure-powerspawn.js - Energy sink
 *
 * Throttled to once every 4th tick to prevent overloading the economy.
 * works out to like 5k power and 250k energy a day versus 20k/1m.
 * should also save a little cpu.
 * 
 * Bucket limiter check disabled, no real logic to run in it's test, the intent cpu isn't my biggest problem.
 */
'use strict';

StructurePowerSpawn.prototype.run = function() {
	// if(BUCKET_LIMITER)
	//	return;
	if(Game.time % (CREEP_LIFE_TIME+200) == 0 && !this.power)
		this.runReload();
	// Not needed, this meets the special case of `checkStructureAgainstController`.
	// if(this.power === 0 || this.energy < POWER_SPAWN_ENERGY_RATIO)
	//	return;
	if((Game.time & 3) === 0)
		this.processPower();	
}

// @todo: Size to power spawn available capacity.
StructurePowerSpawn.prototype.runReload = function() {
	let storedEnergy = _.get(this.room, 'storage.store.energy',0);
	let terminal = this.room.terminal;
	// let storedPower =_.get(this.room, ['terminal.store', RESOURCE_POWER], 0);
	let storedPower = _.get(this.room, ['terminal', 'store', RESOURCE_POWER], 0);
	if(storedEnergy > 10000 && storedPower > 0) {
		let spawn = this.getClosestSpawn();
		// spawn.enqueue([CARRY,MOVE], null, {role: 'filler', src: terminal.id, dest: this.id, res: RESOURCE_POWER, amt: storedPower});
		spawn.enqueue([CARRY,CARRY,MOVE], null, {role: 'filler', src: terminal.id, dest: this.id, res: RESOURCE_POWER, amt: Math.min(storedPower,2*CARRY_CAPACITY)});
		Log.info('Power spawn requesting filler at ' + this.pos.roomName, 'PowerSpawn');
	}
}

/**
 * Track amount of power processed per powerspawn.
 */
let processPower = StructurePowerSpawn.prototype.processPower;
StructurePowerSpawn.prototype.processPower = function() {
	let status = processPower.apply(this, arguments);
	if(status === OK) {
		if(!this.memory.power)
			this.memory.power = 0;
		this.memory.power += 1;
	}
	return status;
}