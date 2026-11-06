# Authentication and schema access

FormFoundry uses local username/password accounts, Argon2 password hashes, and
HS256 JWT bearer tokens. Accounts are created by administrators. There is no
public registration. The frontend stores its token under
`formfoundry_access_token` and sends it in the Authorization header, including
artifact downloads. Tokens expire after `JWT_LIFETIME_MINUTES`, default 60.
Logout clears the token and the query cache. Every API request checks the current
account in the database, so disabling or expiring an account blocks existing tokens.

## Setup

Set these values in the root `.env` before starting the backend:

```dotenv
JWT_SECRET=<a random secret of at least 32 characters>
JWT_ISSUER=formfoundry
JWT_LIFETIME_MINUTES=60
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_PASSWORD=<a password of 12 to 256 characters>
```

Generate a signing secret with `uv run python -c "import secrets; print(secrets.token_urlsafe(48))"`.
Use a separate secret and issuer for each application. Do not reuse Gen BI's
credentials or signing secret. The initial administrator is created only when no
administrator exists. Changing the bootstrap password does not reset an existing
account. Remove the bootstrap password from the environment after provisioning.

Startup creates the new `users` and `schema_access` tables, following the existing
application initialization pattern. Existing installations can also run
`make backend-migrate`. The migration is safe to run after startup has created
the tables. Existing cases with legacy `created_by` values are left in storage
and are not automatically assigned to the initial administrator.

## Permissions

| Action | Administrator | User |
| --- | --- | --- |
| Create, edit, delete schemas | Yes | No |
| Assign schema access and create accounts | Yes | No |
| View schemas or create cases | All schemas | Assigned schemas |
| Read or change case data | Own cases | Own cases under assigned schemas |

The login and admin screens include the shared language selector. The selected
interface language is saved in the browser and survives reloads and sign-in.

Use **Users and schema access** in the sidebar to create accounts, disable or
enable regular accounts, and assign schemas. New users start without schema
access. Assignments apply to every version of the logical schema. Save access
after changing checkboxes. Revoking access blocks the user's existing cases,
evidence, conversations, validation, extraction jobs, and artifact downloads.
The data stays in storage and becomes accessible again if access is restored.
Administrators cannot access another user's cases. Administrator accounts cannot
be disabled or expired through the account API.

## API

All paths below are relative to `/api/v1`.

- `POST /auth/token`: OAuth2 password form containing `username` and `password`.
- `GET /auth/me`: current account.
- `GET /auth/users`: administrator-only account list.
- `POST /auth/users`: administrator-only creation with `username`, `password`, and optional `role`.
- `PATCH /auth/users/{id}`: administrator-only update with `disabled` and optional timezone-aware `expires_at`.
- `GET /auth/users/{id}/schemas`: administrator-only assigned logical schema IDs.
- `PUT /auth/users/{id}/schemas`: replace assignments atomically with `{"template_ids": ["schema-id"]}`.

Health and login are public. All application APIs require authentication.
Inaccessible cases and schemas return 404. Administrator-only operations return
403 for regular accounts. Invalid, expired, or disabled sessions return 401.
Case and evidence authorship is set from the authenticated account, even if the
client submits a different `created_by`.

## Browser tests

The auth and UI regression tests mock the API. The live case lifecycle test needs
a running backend and an account assigned to the FIR schema. Supply
`E2E_USERNAME` and `E2E_PASSWORD` when running `pnpm test:e2e`; without these,
only the live lifecycle test is skipped.
