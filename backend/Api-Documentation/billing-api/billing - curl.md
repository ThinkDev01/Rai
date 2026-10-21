# Billing API — curl

All routes need `Authorization` + `X-Org-Id` (owner/admin), except the webhook.

```bash
# Summary
curl "{{base_url}}/api/v1/billing" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}"

# Invoices / receipts (download links)
curl "{{base_url}}/api/v1/billing/invoices" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}"

# Subscribe — recurring (auto-renew) or one_time
curl -X POST "{{base_url}}/api/v1/billing/subscribe" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}" \
  -H "Content-Type: application/json" \
  -d '{ "mode": "recurring" }'

# Confirm a completed checkout (one-time shown; recurring sends subscriptionId)
curl -X POST "{{base_url}}/api/v1/billing/confirm" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}" \
  -H "Content-Type: application/json" \
  -d '{ "orderId": "order_Xxx", "paymentId": "pay_Xxx", "signature": "hex..." }'

# Cancel — OTP-gated. First request a code:
curl -X POST "{{base_url}}/api/v1/otp/request" \
  -H "Authorization: Bearer {{token}}" \
  -H "Content-Type: application/json" \
  -d '{ "action": "cancel_subscription", "targetId": "{{org_id}}" }'
# ...then pass the emailed code:
curl -X POST "{{base_url}}/api/v1/billing/cancel" \
  -H "Authorization: Bearer {{token}}" \
  -H "X-Org-Id: {{org_id}}" \
  -H "Content-Type: application/json" \
  -d '{ "code": "123456", "immediate": false }'

# Webhook (Razorpay → server). Signature is computed by Razorpay; shown for shape only.
curl -X POST "{{base_url}}/api/v1/billing/webhook" \
  -H "Content-Type: application/json" \
  -H "x-razorpay-signature: <hmac-sha256-of-raw-body>" \
  -d '{ "event": "subscription.activated", "payload": { "subscription": { "entity": { "id": "sub_Xxx", "current_end": 1751990400 } } } }'
```
