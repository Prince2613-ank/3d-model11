exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    update assets
    set description = name || '''s chair (' || object_key || ')'
    where category = 'chair' and deleted_at is null;
  `);
};

exports.down = () => {
  // Descriptions remain valid human-readable values after rollback.
};
