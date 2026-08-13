exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    alter table assets
      add column if not exists designation text;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    alter table assets drop column if exists designation;
  `);
};
