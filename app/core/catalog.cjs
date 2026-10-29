// Both catalogues are bundled and trusted. IPC only accepts their IDs.
module.exports = [...require('../shared/tweaks.json'), ...require('../shared/system-tweaks.json')];
