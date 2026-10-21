# Discover Orgs by Domain

`GET /api/v1/orgs/discover-by-domain`

Returns orgs whose owner shares the caller's email domain. Powers the "an org with your email domain already exists" hint. Domain comes from the caller's own email, not from input.

## Request
- Auth required. No params.
- Public-email domains (gmail, outlook, yahoo, etc.) always return an empty list. An unverified-email org owner is never returned.

## Responses

**200 — OK**
```json
{
  "success": true,
  "data": {
    "orgs": [
      { "id": "018f...", "name": "Acme Inc", "discoverable": true }
    ]
  },
  "error": ""
}
```
`orgs` is `[]` when the caller's domain is a public-email domain, when no peers exist, or when peers are non-discoverable and the caller is not a member of them.

**500 — db error**
```json
{ "success": false, "data": {}, "error": "Could not look up domain peers" }
```
