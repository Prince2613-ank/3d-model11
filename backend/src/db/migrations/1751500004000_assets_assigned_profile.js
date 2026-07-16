exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    alter table assets
      add column if not exists assigned_to_profile_id uuid references profiles(id);

    create index if not exists assets_assigned_to_profile_id_idx
      on assets (assigned_to_profile_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    drop index if exists assets_assigned_to_profile_id_idx;
    alter table assets drop column if exists assigned_to_profile_id;
  `);
};
