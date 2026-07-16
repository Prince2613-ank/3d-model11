exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    alter table complaints alter column asset_id drop not null;
    alter table complaints add column if not exists target_type text not null default 'asset';
    alter table complaints add column if not exists target_name text;

    update complaints c
       set target_type = 'asset', target_name = a.name
      from assets a
     where c.asset_id = a.id and c.target_name is null;

    alter table complaints drop constraint if exists complaints_target_type_check;
    alter table complaints add constraint complaints_target_type_check
      check (target_type in ('asset', 'room'));
    alter table complaints add constraint complaints_target_reference_check
      check (asset_id is not null or target_type = 'room');
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    delete from complaints where asset_id is null;
    alter table complaints alter column asset_id set not null;
    alter table complaints drop constraint if exists complaints_target_reference_check;
    alter table complaints drop constraint if exists complaints_target_type_check;
    alter table complaints drop column if exists target_name;
    alter table complaints drop column if exists target_type;
  `);
};
