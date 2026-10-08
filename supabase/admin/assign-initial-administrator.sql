-- Run in Evolution Media's SQL Editor after the admin ingestion migration.
-- This user UUID was supplied by the project owner. No password is needed.
insert into private.song_administrators(user_id)
values ('851d2e86-8cc5-4a68-847a-5cd93070ac77')
on conflict (user_id) do nothing;
