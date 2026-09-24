# Synthetic Claude fixture

These fixtures are generated entirely from `test/helpers/fake-secrets.js` and reserved example domains.

- Endpoint: `POST /api/organizations/{org}/chat_conversations/{id}/completion`
- Request slots: `prompt` and `attachments[*].extracted_content`
- Response: `text/event-stream`
- Stream shape: `completion` deltas with `message_stop` terminal event
- No cookies, authorization values, CSRF tokens, or real account identifiers are present.
