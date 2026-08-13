exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    alter table assets
      add column if not exists joining_date date;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    alter table assets drop column if exists joining_date;
  `);
};
