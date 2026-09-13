-- Migration 023: correct per-market betting schedule (undo blanket 14:00)
BEGIN;

UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 09:48:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='king-kong-4d-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 14:18:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='5d-toto-macau-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-14',
  close_at=('2026-09-13 16:49:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='4d-toto-macau-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 15:38:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='hongkong-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 06:53:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='sydney-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 04:48:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='wellington-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 09:18:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='prague-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 12:48:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='seattle-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 10:48:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='medellin-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 11:18:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='emerlad-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 08:18:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='china-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 12:43:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='pcso-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 05:18:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='bullseye-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 09:48:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='jepang-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 13:33:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='taiwan-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-14',
  close_at=('2026-09-14 00:08:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='wisconsin-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 04:48:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='cambodia-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 09:48:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='belize-mor-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 00:48:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='merida-eve-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 08:48:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='merida-mor-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 05:48:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='merida-night-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-14',
  close_at=('2026-09-13 17:18:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='belize-mid-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 05:18:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='belize-night-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 01:18:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='belize-eve-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-14',
  close_at=('2026-09-13 17:48:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='merida-mid-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-14',
  close_at=('2026-09-13 23:38:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='georgia-eve-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 04:17:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='georgia-ngt-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-14',
  close_at=('2026-09-13 20:38:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='oregon-1-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 02:38:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='oregon-3-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 05:38:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='oregon-4-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-14',
  close_at=('2026-09-13 17:07:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='ohio-mid-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-14',
  close_at=('2026-09-14 00:07:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='ohio-eve-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-14',
  close_at=('2026-09-13 23:38:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='oregon-2-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-14',
  close_at=('2026-09-13 17:08:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='georgia-mid-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-14',
  close_at=('2026-09-13 17:08:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='maryland-mid-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 00:38:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='maryland-eve-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-14',
  close_at=('2026-09-13 17:37:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='michigan-mid-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-14',
  close_at=('2026-09-14 00:07:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='michigan-eve-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-14',
  close_at=('2026-09-13 17:37:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='newjerseymid-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 00:34:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='newjerseyeve-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-14',
  close_at=('2026-09-13 17:59:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='kentucky-mid-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 03:42:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='kentucky-eve-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-14',
  close_at=('2026-09-13 18:03:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='tennesse-mid-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 15:03:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='tennesse-mor-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-14',
  close_at=('2026-09-14 00:01:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='tennesse-eve-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 15:43:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='texas-mor-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-14',
  close_at=('2026-09-13 23:38:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='texas-eve-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-14',
  close_at=('2026-09-13 18:08:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='texas-day-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 03:55:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='texas-night-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-14',
  close_at=('2026-09-13 18:08:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='florida-mid-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 00:40:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='florida-eve-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-14',
  close_at=('2026-09-13 18:08:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='rhode-island-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 02:58:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='illinois-eve-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-14',
  close_at=('2026-09-13 18:18:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='illinois-mid-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-14',
  close_at=('2026-09-13 18:23:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='missouri-mid-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 02:42:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='missouri-eve-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-14',
  close_at=('2026-09-13 18:33:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='washingtonmd-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 00:35:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='washingtonev-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 00:35:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='delaware-ngt-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-14',
  close_at=('2026-09-13 18:36:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='delaware-day-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 03:38:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='virginia-ngt-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-14',
  close_at=('2026-09-13 18:38:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='virginia-day-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-14',
  close_at=('2026-09-13 19:38:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='northcaroday-pool');
UPDATE market_betting_configs SET betting_status='OPEN', betting_period='2026-09-13',
  close_at=('2026-09-13 03:55:00+00')::timestamptz, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='northcaroeve-pool');
UPDATE market_betting_configs SET betting_status='SUSPENDED', betting_period=NULL,
  close_at=NULL, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='newyork-pool');
UPDATE market_betting_configs SET betting_status='SUSPENDED', betting_period=NULL,
  close_at=NULL, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='singapore-pool');
UPDATE market_betting_configs SET betting_status='SUSPENDED', betting_period=NULL,
  close_at=NULL, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='auckland-pool');
UPDATE market_betting_configs SET betting_status='SUSPENDED', betting_period=NULL,
  close_at=NULL, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='napier-hasti-pool');
UPDATE market_betting_configs SET betting_status='SUSPENDED', betting_period=NULL,
  close_at=NULL, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='christchurch-pool');
UPDATE market_betting_configs SET betting_status='SUSPENDED', betting_period=NULL,
  close_at=NULL, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='tauranga-pool');
UPDATE market_betting_configs SET betting_status='SUSPENDED', betting_period=NULL,
  close_at=NULL, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='nelson-pool');
UPDATE market_betting_configs SET betting_status='SUSPENDED', betting_period=NULL,
  close_at=NULL, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='california-pool');
UPDATE market_betting_configs SET betting_status='SUSPENDED', betting_period=NULL,
  close_at=NULL, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='invercargill-pool');
UPDATE market_betting_configs SET betting_status='SUSPENDED', betting_period=NULL,
  close_at=NULL, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='queenstown-pool');
UPDATE market_betting_configs SET betting_status='SUSPENDED', betting_period=NULL,
  close_at=NULL, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='rotorua-pool');
UPDATE market_betting_configs SET betting_status='SUSPENDED', betting_period=NULL,
  close_at=NULL, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='new-plymouth-pool');
UPDATE market_betting_configs SET betting_status='SUSPENDED', betting_period=NULL,
  close_at=NULL, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='gisborne-pool');
UPDATE market_betting_configs SET betting_status='SUSPENDED', betting_period=NULL,
  close_at=NULL, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='whang-rei-pool');
UPDATE market_betting_configs SET betting_status='SUSPENDED', betting_period=NULL,
  close_at=NULL, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='palmerston-pool');
UPDATE market_betting_configs SET betting_status='SUSPENDED', betting_period=NULL,
  close_at=NULL, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='dunedin-pool');
UPDATE market_betting_configs SET betting_status='SUSPENDED', betting_period=NULL,
  close_at=NULL, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='hamilton-pool');
UPDATE market_betting_configs SET betting_status='SUSPENDED', betting_period=NULL,
  close_at=NULL, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='newyork-eve-pool');
UPDATE market_betting_configs SET betting_status='SUSPENDED', betting_period=NULL,
  close_at=NULL, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='newyork-mid-pool');
UPDATE market_betting_configs SET betting_status='SUSPENDED', betting_period=NULL,
  close_at=NULL, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='indiana-mid-pool');
UPDATE market_betting_configs SET betting_status='SUSPENDED', betting_period=NULL,
  close_at=NULL, auto_cash_window=FALSE, updated_by=NULL, updated_at=now()
  WHERE market_id=(SELECT id FROM markets WHERE slug='indiana-eve-pool');

COMMIT;
