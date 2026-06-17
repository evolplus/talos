# Example Markdown Contract

A real-feeling Markdown contract for a single endpoint. For multi-endpoint services, prefer OpenAPI; for one-off contracts during early implementation, this format is fine.

---

```markdown
# POST /api/v1/users

Status: Frozen
Last-Updated: 2026-05-08T10:30:00Z
Frozen-By: be-dev
Frozen-At: 2026-05-08T10:30:00Z
Version: 1.0.0
Service: users
Auth: required, role `admin`

## Description

Create a new user. Idempotent on `email`: a duplicate POST returns 409 with the existing user's ID rather than creating a second row.

## Request

```http
POST /api/v1/users
Authorization: Bearer <token>
Content-Type: application/json
Idempotency-Key: <uuid>           # optional, client-generated; required for PUT/POST in v2

{
  "email": "user@example.com",
  "role": "editor",
  "display_name": "Sam"          # optional, max 64 chars
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| email | string | yes | RFC 5322, max 254 chars, unique |
| role | string | yes | enum: `admin` \| `editor` \| `viewer` |
| display_name | string | no | max 64 chars; defaults to email local-part |

## Responses

### 201 Created

```json
{
  "id": "01HXYZ123ABC456DEF",
  "email": "user@example.com",
  "role": "editor",
  "display_name": "Sam",
  "created_at": "2026-05-08T10:30:00Z"
}
```

### 400 Bad Request — invalid input

```json
{
  "code": "INVALID_INPUT",
  "message": "Field 'email' is invalid",
  "details": {
    "field": "email",
    "reason": "format"
  }
}
```

Possible reasons: `format`, `length`, `missing`.

### 401 Unauthorized — token missing or invalid

```json
{
  "code": "UNAUTHORIZED",
  "message": "Authentication required"
}
```

### 403 Forbidden — caller is not admin

```json
{
  "code": "FORBIDDEN",
  "message": "Role 'admin' required",
  "details": { "required_role": "admin", "your_role": "editor" }
}
```

### 409 Conflict — email already exists

```json
{
  "code": "DUPLICATE_EMAIL",
  "message": "User with this email already exists",
  "details": {
    "existing_id": "01HABC456DEF789GHI"
  }
}
```

### 422 Unprocessable Entity — semantic validation failure

```json
{
  "code": "ROLE_NOT_PERMITTED",
  "message": "Role 'admin' cannot be assigned through this endpoint",
  "details": { "requested_role": "admin" }
}
```

### 500 Internal Server Error — generic failure

```json
{
  "code": "INTERNAL",
  "message": "An unexpected error occurred",
  "trace_id": "01HXYZ..."
}
```

## Idempotency

- A repeat request with the same `email` returns 409 (not a fresh 201).
- A repeat request with the same `Idempotency-Key` (within 24 hours) returns the original 201 response with the same `id`.

## Rate limit

- Per-token: 60 req/min
- Global service ceiling: 600 req/s

## Observability

- Emits `user.created` event on the `user-events` topic on success
- Increments `users.create.success` / `users.create.failure` counters
```

---

OpenAPI / Proto equivalents are mechanical translations of the same fields; pick the format that matches your stack.
