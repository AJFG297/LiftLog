/** @type {import('@expo/fingerprint').Config} */
module.exports = {
  extraSources: [
    {
      type: 'dir',
      filePath: '../docs/schemas/workout-worker',
      reasons: ['workout-worker generated native contract'],
    },
  ],
};
