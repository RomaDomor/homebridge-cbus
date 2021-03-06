'use strict';

module.exports = CBusNetId;

const cbusUtils = require('./cbus-utils.js');

// object representing C-Bus network id (netId) in one of the following formats:
// project -- '//SHAC/'
// network -- '//SHAC/254'
// application: '//SHAC/254/56'
// group address: '//SHAC/254/56/191'
// unit address: '//SHAC/254/p/22'
function CBusNetId(project, network, param3, param4, param5) {
	// project
	if (typeof project === `undefined`) {
		throw new Error(`netIds must have a project`);
	}

	this.project = CBusNetId.validatedProjectName(project);

	// channel
	if (!!param5) {
		this.channel = CBusNetId.validatedChannelNumber(param5, "channel");
	}

	// network
	this.network = CBusNetId.validatedNumber(network, "network");

	if (param3 === `p`) {
		// unit address
		this.unitAddress = CBusNetId.validatedNumber(param4, "unitAddress");

		if (typeof this.unitAddress === `undefined`) {
			throw new Error(`unit netIds must have a unitAddress`);
		}
	} else {
		// application and group
		this.application = CBusNetId.validatedNumber(param3, "application");

		this.group = CBusNetId.validatedNumber(param4, "group");

		if ((typeof this.group !== `undefined`) && (typeof this.application === `undefined`)) {
			throw new Error(`group netIds must have an application`);
		}
	}

	if (typeof this.network === `undefined`) {
		// check that we don't have nonsense
		if (typeof this.application === `number`) {
			throw new Error(`netIds with application must have a network`);
		}

		// this is redundant -- not possible to get this far without failing on
		// `netIds with application must have a network` or `group netIds must have an application`
		// if (typeof this.group === `number`) {
		// 	throw new Error(`group netIds must have a network`);
		// }

		if (typeof this.unitAddress === `number`) {
			throw new Error(`unit netIds must have a network`);
		}
	}
}

CBusNetId.prototype.toString = function () {
	let result;

	if (this.isProjectId()) {
		result = `//${this.project}`;
	} else if (this.isNetworkId()) {
		result = `//${this.project}/${this.network}`;
	} else if (this.isApplicationId()) {
		result = `//${this.project}/${this.network}/${this.application}`;
	} else if (this.isGroupId()) {
		result = `//${this.project}/${this.network}/${this.application}/${this.group}`;
	} else if (!!this.channel) {
		result = `//${this.project}/${this.network}/${this.application}/${this.group}/${this.channel}`;
	} else {
		result = `//${this.project}/${this.network}/p/${this.unitAddress}`;
	}
	
	return result;
};

CBusNetId.prototype.inspect = function () {
	return this.toString();
};

CBusNetId.prototype.getHash = function () {
	let hash;

	if (this.isProjectId()) {
		hash = this.project;
	} else if (this.isUnitId()) {
		hash = (0x2 << 24) | (this.network << 16) | this.unitAddress;
	} else {
		hash = (0x1 << 24) | (this.network << 16) | (this.application << 8) | this.group;
	}

	return hash.toString(16);
};

CBusNetId.prototype.isProjectId = function () {
	return (typeof this.network === `undefined`);
};

CBusNetId.prototype.isNetworkId = function () {
	return (typeof this.network !== `undefined`) && (typeof this.application === `undefined`) && (typeof this.unitAddress === `undefined`);
};

CBusNetId.prototype.isApplicationId = function () {
	return (typeof this.application !== `undefined`) && (typeof this.group === `undefined`);
};

CBusNetId.prototype.isGroupId = function () {
	return !this.isApplicationId() && !this.channel && (typeof this.group !== `undefined`);
};

CBusNetId.prototype.isUnitId = function () {
	return (typeof this.unitAddress !== `undefined`);
};

CBusNetId.prototype.isSameNetwork = function (other) {
	console.assert(other instanceof CBusNetId);

	return this.network === other.network;
};

CBusNetId.prototype.isSameApplication = function (other) {
	console.assert(other instanceof CBusNetId);
	console.assert(!this.isUnitId() && !other.isUnitId());

	return this.application === other.application;
};

CBusNetId.prototype.isEquals = function (other) {
	if (this.project !== other.project) {
		return false;
	}

	let ah = this.getHash();
	let bh = other.getHash();
	return ah === bh;
};

// static factory method
CBusNetId.parse = function (netIdString) {
	const NETID_REGEX = /^\/\/([A-Z0-9_]{1,8})(?:\/(\d{1,3})(?:\/(p|\d{1,3})(?:\/(\d{1,3}))?)?)?\/?(\d{1,3})?$/;

	let components = netIdString.match(NETID_REGEX);
	if (!components) {
		throw new Error(`badly formed netid: '${netIdString}'`);
	}

	return new CBusNetId(components[1], components[2], components[3], components[4], components[5]);
};

CBusNetId.validatedProjectName = function (name) {
	//c-gate docs state that these cases are illegal but toolkit still allows
	const cgateReservedWords = ['P', 'CBUS', 'VM', 'CMDINT', 'CGATE', 'TAG'];

	if (cgateReservedWords.indexOf(name) > -1 ){
		throw new Error(`illegal project name (cannot be a reserved word: 'P', 'CBUS', 'VM', 'CMDINT', 'CGATE', 'TAG') '${name}'`);
	}

	if (name.match(/^CMD([0-9]+)$/)) {
		throw new Error(`illegal project name (cannot be reserved word: 'CMDn (where n is a number) '${name}'`);
	}

	if (name.match(/^([0-9_]{1,8})$/)) {
		throw new Error(`illegal project name (cannot be all numeric) '${name}'`);
	}

	if (!name.match(/^([A-Z0-9_]{1,8})$/)) {
		throw new Error(`illegal project name (format /[A-Z0-9_]{1,8}/) '${name}'`);
	}

	return name;
};

CBusNetId.validatedNumber = function (value, name) {
	value = cbusUtils.integerise(value);

	if ((typeof value !== `undefined`) && ((value < 0) || (value > 255))) {
		throw new Error(`${name} out of range: ${value}`);
	}

	return value;
};

CBusNetId.validatedChannelNumber = function (value) {
	value = cbusUtils.integerise(value);

	if (value && ((value <= 0) || (value >= 8))) {
		throw new Error(`channel out of range: ${value}`);
	}

	return value;
};

// assumes both are CBusNetId
CBusNetId.compare = function (a, b) {
	console.assert((a instanceof CBusNetId) && (b instanceof CBusNetId));

	// alphabetical order on project name
	if (a.project !== b.project) {
		return a.project < b.project ? -1 : 1;
	}

	// unitIds after all other Ids
	if (a.isUnitId() !== b.isUnitId()) {
		return a.isUnitId() ? 1 : -1;
	}

	// otherwise just go by the hash of the address
	return (a.getHash() < b.getHash()) ? -1 : 1;
};
