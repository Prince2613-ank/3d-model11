exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    alter table profiles
      add column if not exists last_session_id text;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    alter table profiles drop column if exists last_session_id;
  `);
};
