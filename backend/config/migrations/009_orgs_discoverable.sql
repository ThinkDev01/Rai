-- Migration 009 - add `discoverable` flag to organizations.
--
-- Used by the domain-peer discovery feature: when an owner sets discoverable
-- = FALSE, the org is hidden from other users' "another org in your domain
-- exists" banners. Owner can still see + toggle their own org's state from
-- Settings → Other organizations in your email domain.
--
-- Defaults to TRUE so existing orgs remain discoverable. Owner opts INTO
-- privacy explicitly. NOT NULL so we never deal with three-state truth
-- (true / false / null) in queries.

ALTER TABLE organizations
  ADD COLUMN discoverable BOOLEAN NOT NULL DEFAULT TRUE;
