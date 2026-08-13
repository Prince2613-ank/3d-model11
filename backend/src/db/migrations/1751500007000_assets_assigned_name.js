exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    alter table assets
      add column if not exists assigned_to_name text;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    alter table assets drop column if exists assigned_to_name;
  `);
};
