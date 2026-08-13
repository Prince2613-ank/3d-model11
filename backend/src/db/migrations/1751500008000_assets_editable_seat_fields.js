exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    alter table assets add column if not exists seat_id text;
    alter table assets add column if not exists seat_number text;
    update assets set seat_id = object_key where seat_id is null;
    update assets set seat_number = regexp_replace(object_key, '^.*-', '') where seat_number is null;
    alter table assets alter column seat_id set not null;
    create unique index if not exists assets_seat_id_unique on assets (seat_id) where deleted_at is null;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    drop index if exists assets_seat_id_unique;
    alter table assets drop column if exists seat_number;
    alter table assets drop column if exists seat_id;
  `);
};
