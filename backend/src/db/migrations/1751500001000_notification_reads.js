/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    alter type notification_type add value if not exists 'complaint_replied';

    create table if not exists notification_reads (
      notification_id uuid not null references notifications(id) on delete cascade,
      user_id uuid not null references profiles(id) on delete cascade,
      read_at timestamptz not null default now(),
      primary key (notification_id, user_id)
    );

    create index if not exists notification_reads_user_id_idx
      on notification_reads (user_id, read_at desc);

    alter table notification_reads enable row level security;

    drop policy if exists notification_reads_select on notification_reads;
    create policy notification_reads_select on notification_reads
      for select using (user_id = auth.uid());

    drop policy if exists notification_reads_insert on notification_reads;
    create policy notification_reads_insert on notification_reads
      for insert with check (user_id = auth.uid());
  `);
};

exports.down = (pgm) => {
  pgm.sql(`drop table if exists notification_reads cascade;`);
};
