# Audit API Documentation

Base URL: `/api/v1`

All endpoints are protected by an API Key unless disabled in the environment. Pass the key in the headers:
```http
Authorization: Bearer <YOUR_API_KEY>
```

> **Note on Response Format**:
> All API responses are wrapped in a standard JSON envelope containing metadata (`id`, `ver`, `ts`, `params`, `responseCode`) and a `result` object holding the actual data.

---

## 1. Audit Logs

### Log an Event
**POST** `/audit/log`

Creates a new audit log entry. The event message is dynamically resolved if a template exists for the specified `serviceName`, `entityType`, and `eventAction`.

**Request Body:**
```json
{
  "serviceName": "user-service",
  "entityType": "USER",
  "eventType": "LOGIN",
  "eventAction": "LOGIN_SUCCESS",
  "actorId": "550e8400-e29b-41d4-a716-446655440000",
  "actorName": "Jane Doe",
  "status": "SUCCESS",
  "occurredAt": "2026-04-27T10:00:00Z"
}
```
*Note: `actorId` and `entityId` must be valid UUIDs.*

**Standardized Response Envelope (201 Created):**
```json
{
  "id": "api.audit.log",
  "ver": "1.0",
  "ts": "2026-04-27T10:07:16.430Z",
  "params": {
    "resmsgid": "c3286d08-8f30-4123-bfb8-f63a2832a74e",
    "status": "successful",
    "err": null,
    "errmsg": null,
    "successmessage": "Request processed successfully"
  },
  "responseCode": 201,
  "result": {
    "id": "f53593e9-6843-4222-ab40-3b2a03bcf280",
    "serviceName": "user-service",
    ...
  }
}
```

### Integration Example (Calling from another service)

If your other microservices need to call this Audit API directly via HTTP (instead of using the SDK or Kafka), you can use standard HTTP clients like `fetch` or `axios`.

**Example using Node.js `fetch`:**
```javascript
const response = await fetch('http://audit-api.internal/api/v1/audit/log', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer <YOUR_API_KEY>'
  },
  body: JSON.stringify({
    serviceName: 'order-service',
    entityType: 'ORDER',
    eventType: 'CREATED',
    eventAction: 'ORDER_OPENED',
    actorId: '550e8400-e29b-41d4-a716-446655440000',
    actorName: 'John Doe',
    status: 'SUCCESS',
    context: { orderTotal: 150.50 }
  })
});

const data = await response.json();
console.log("Logged Audit Event:", data.result.id);
```

### Retrieve Logs
**GET** `/audit/logs`

Retrieves paginated audit logs.

**Query Parameters:**
- `service_name` (optional): Filter by service domain.
- `entity_type` (optional): Filter by domain entity (e.g. `USER`).
- `status` (optional): `SUCCESS` or `FAILED`.
- `search` (optional): Text search across the human readable message or action.
- `page` (optional): Default `1`.
- `limit` (optional): Default `10`.

**Response Result Format:**
```json
"result": {
  "items": [ ... ],
  "total": 50,
  "page": 1,
  "limit": 10,
  "totalPages": 5
}
```

---

## 2. Message Templates

You can define dynamic templates used to hydrate a generic message (e.g. `"User ${actorName} logged in."`) when a log is received.

### List all Templates
**GET** `/templates`

### Create a Template
**POST** `/templates`

**Request Body Example:**
```json
{
  "serviceName": "user-service",
  "entityType": "USER",
  "eventType": "LOGIN",
  "eventAction": "LOGIN_SUCCESS",
  "languageCode": "en",
  "template": "User ${actorName} successfully logged in from IP ${context.ipAddress}."
}
```

### Delete a Template
**DELETE** `/templates/:id`
