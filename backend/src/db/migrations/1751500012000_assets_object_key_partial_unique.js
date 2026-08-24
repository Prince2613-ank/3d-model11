exports.shorthands = undefined;

// object_key previously carried a plain table-wide unique constraint, so a
// soft-deleted asset (deleted_at set) still held its object_key forever.
// Deleting an employee/seat and then adding a new one at the same physical
// seat (same 3D-scene object_key) hit "duplicate key value violates unique
// constraint assets_object_key_key" even though the old row was gone from
// every listing. Mirror the assets_seat_id_unique pattern: scope uniqueness
// to live rows only.
exports.up = (pgm) => {
  pgm.sql(`
    alter table assets drop constraint if exists assets_object_key_key;
    create unique index if not exists assets_object_key_unique on assets (object_key) where deleted_at is null;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    drop index if exists assets_object_key_unique;
    alter table assets add constraint assets_object_key_key unique (object_key);
  `);
};
