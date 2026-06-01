# PlaNeat Mail Client Design

**Date:** 2026-06-01

**Goal:** Add an Outlook-like mail workspace inside PlaNeat where each logged-in user can read and send email from their own company mailbox, while composing messages against CRM customer contacts.

**Decision:** Build a native PlaNeat mail page using Roundcube and SOGo as UX references. Do not embed Roundcube, SOGo, mailcow, or another webmail UI into the app. The PlaNeat frontend will call FastAPI mail endpoints, and the backend will connect to each user's company IMAP and SMTP account.

---

## Context

PlaNeat already has:

- A Next.js 14 App Router frontend under `frontend/app/(app)`.
- A FastAPI backend with MongoDB and existing user management in `backend/app/services/auth_service.py`.
- Access Control at `frontend/app/(app)/it-access/page.tsx` and `UserDetailModal.tsx`.
- CRM B2B contacts and customers with email addresses.
- Existing SMTP settings and send helpers for system emails and CRM contact emails.

The new mail workspace should feel like an internal app module, not a separate hosted webmail product. The closest visual references are Outlook, Roundcube, and SOGo: folders on the left, message list in the middle, message reader on the right, and a compact toolbar for common actions.

PlaNeat must keep two email concepts separate:

- **Profile email:** the existing user email used for account identity, OTP, registration, password recovery, and personnel data.
- **Company mail account:** the mailbox used by `/mail` for IMAP inbox access and SMTP sending.

The mail feature must never silently use the profile email as the company mailbox. If a company mailbox is not configured, `/mail` asks for the company mail login and stores it securely after a successful connection test.

## Scope

The first implementation should include:

- A `/mail` page in the authenticated app shell.
- Sidebar navigation entry under communication.
- Per-user company mail account settings managed from Access Control.
- First-use company mail login capture from `/mail` when the account is not configured.
- Secure storage of each user's company mail credential.
- IMAP inbox and folder listing for the logged-in user.
- Read-only message browsing in the first mail phase.
- Compose, reply, and forward using the logged-in user's SMTP settings.
- CRM contact autocomplete for recipients.
- Basic sent-mail activity logging back into CRM where a matching customer/contact exists.
- Clear empty, disconnected, loading, error, and re-authentication states.

The first implementation should not include:

- Hosting a full mail server.
- Migrating company email to mailcow, Mailu, Modoboa, or Stalwart.
- Delete, archive, junk, or move actions that mutate the remote mailbox.
- Attachment upload and download.
- Calendar, meeting invites, or shared mailboxes.
- Background mail sync jobs.

Those features can be added after the inbox and send flows are stable.

## Architecture

The feature has three bounded areas:

1. **Access Control company mail account management**
   Admin-capable users manage each user's company mail connection details from the existing user detail modal. Passwords are only accepted as write-only inputs.

2. **Mail transport backend**
   FastAPI exposes mail endpoints that load the current user's stored company mail account, decrypt the credential on the server, and use IMAP/SMTP libraries to list folders, list messages, read a message, and send email.

3. **PlaNeat Mail UI**
   Next.js renders the Outlook-like page and uses the backend as its only mail transport boundary. The browser never receives the saved mail password.

## User Email Data Model

The existing top-level `email` field remains the profile email. It must keep its current meaning and must not be treated as the mailbox credential.

Each user document should receive a separate nested `companyMailAccount` object:

```json
{
  "enabled": true,
  "emailAddress": "user@southernseafood.co.th",
  "displayName": "User Name",
  "imapHost": "imap.southernseafood.co.th",
  "imapPort": 993,
  "imapSecurity": "ssl",
  "smtpHost": "smtp.southernseafood.co.th",
  "smtpPort": 587,
  "smtpSecurity": "starttls",
  "username": "user@southernseafood.co.th",
  "passwordEncrypted": "server-encrypted-secret",
  "verifiedAt": "2026-06-01T16:30:00Z",
  "lastTestedAt": "2026-06-01T16:30:00Z",
  "status": "connected",
  "lastError": ""
}
```

Allowed `imapSecurity` values:

- `ssl`
- `starttls`
- `none`

Allowed `smtpSecurity` values:

- `ssl`
- `starttls`
- `none`

Allowed `status` values:

- `not_configured`
- `needs_password`
- `connected`
- `failed`
- `disabled`

The API must never return `passwordEncrypted` or any decrypted password to the frontend.

When returning user records to Access Control, the backend may include a sanitized `companyMailAccount` summary:

```json
{
  "enabled": true,
  "emailAddress": "user@southernseafood.co.th",
  "displayName": "User Name",
  "imapHost": "imap.southernseafood.co.th",
  "imapPort": 993,
  "imapSecurity": "ssl",
  "smtpHost": "smtp.southernseafood.co.th",
  "smtpPort": 587,
  "smtpSecurity": "starttls",
  "username": "user@southernseafood.co.th",
  "verifiedAt": "2026-06-01T16:30:00Z",
  "lastTestedAt": "2026-06-01T16:30:00Z",
  "status": "connected",
  "lastError": ""
}
```

## Credential Security

The backend must encrypt each company mail password before storing it in MongoDB. The encryption key should come from an environment variable named `MAIL_CREDENTIAL_KEY`.

Expected behavior:

- If `MAIL_CREDENTIAL_KEY` is missing, company mail account save and mail send/read operations fail with a setup error.
- If the key changes and old credentials can no longer be decrypted, the account becomes `needs_password`.
- Access Control shows connection status and timestamps, but not the stored password.
- Updating a password requires the admin or user to enter it again.
- Opening `/mail` may collect and save the company mail password only when the mailbox is not configured, is disconnected, or needs re-authentication.
- Failed connection attempts must not log the raw password.

## Access Control UX

`UserDetailModal` gets a new "Company Mail Account" section. This section is separate from the existing profile email field.

View mode shows:

- Email address.
- IMAP host and SMTP host.
- Enabled or disabled state.
- Connection status.
- Last tested timestamp.
- Last error summary, if any.

Edit mode shows:

- Toggle: enable company mail account.
- Email address.
- Display name.
- IMAP host.
- IMAP port.
- IMAP security select.
- SMTP host.
- SMTP port.
- SMTP security select.
- Username.
- New password.
- Confirm new password.
- Button: test connection.
- Status result from the latest test.

Save rules:

- A company mail account can be saved without changing the password if it already has a valid encrypted password.
- A new account requires password and password confirmation.
- If a password is entered, both password fields must match.
- "Test connection" validates IMAP login and SMTP login before marking the account `connected`.
- If only metadata is changed and the existing password still decrypts, the backend can retest using the stored credential.
- Updating the existing profile email must not update `companyMailAccount.emailAddress`.
- Updating the company mail address must not update the existing profile email.

## First-Use Company Mail Login

If a user opens `/mail` and `companyMailAccount` is missing, disabled, or `needs_password`, the page should show a secure setup prompt instead of the inbox.

The setup prompt includes:

- Company email address.
- Mail username.
- Password.
- Confirm password.
- Optional advanced IMAP and SMTP settings, prefilled from company defaults when available.
- Button: connect and save.

On submit:

1. The frontend sends the entered values to a current-user endpoint.
2. The backend tests IMAP and SMTP.
3. If both tests pass, the backend encrypts the password and stores the sanitized account under the current user's `companyMailAccount`.
4. The frontend refreshes `/mail` and loads the mailbox.
5. If either test fails, no password is persisted unless an existing valid password was already stored.

This first-use flow writes the same backend data that Access Control uses, so admins can later inspect status and update the account without seeing the password.

## Mail Page UX

Route: `/mail`

Navigation:

- Add "Mail" under the existing communication section.
- Page access should be available to active users.
- Users without a configured company mail account can still open the page and complete the first-use company mail login flow.

Layout:

- Left rail: account identity, folder list, and quick CRM/contact entry point.
- Middle pane: search box, Focused/Other tabs as visual structure, message list, unread/attachment markers.
- Right pane: selected message reader.
- Top toolbar: New, Reply, Reply all, Forward, Refresh, Mark as read, More. Mutating actions such as Delete, Archive, Junk, and Move should be disabled or hidden until mailbox mutation is implemented.

Primary states:

- `not_configured`: show first-use company mail login form.
- `needs_password`: ask the user to re-enter the company mail password, then test and save it securely.
- `failed`: show the last connection error and a retry button.
- `connected_empty`: show an empty inbox message.
- `connected_loading`: show skeleton rows and reader loading state.
- `connected_ready`: show folders, messages, and reader.

## Compose, Reply, and Forward

The compose modal or panel should include:

- From: current user's configured company mail address.
- To, CC, BCC.
- CRM recipient autocomplete using customer and contact email fields.
- Subject.
- Body editor as plain text or basic rich text in the first phase.
- Send button with disabled state while sending.
- Error and success feedback.

Reply behavior:

- Reply pre-fills the sender as recipient.
- Reply all includes original To and CC except the current user's address.
- Forward prefixes subject and quotes the original message in the body.

After send succeeds:

- The UI shows success feedback.
- If the recipient matches a CRM contact or customer, create a CRM activity of type `email`.
- Store only activity metadata and message summary in PlaNeat. Do not store full message bodies in this design; a separate mail archive spec must approve that behavior first.

## Backend API

Add a new router, likely `backend/app/routers/mail.py`, with authenticated endpoints.

Recommended endpoints:

- `GET /api/mail/account/me`
  Returns current user's company mail account status without secrets.

- `PUT /api/mail/account/me`
  Current-user endpoint used by first-use setup and re-authentication. It updates only the authenticated user's company mail account.

- `PUT /api/users/{username}/mail-account`
  Admin endpoint used by Access Control to update another user's company mail account settings.

- `POST /api/users/{username}/mail-account/test`
  Admin endpoint used by Access Control to test another user's company mail account settings.

- `POST /api/mail/account/me/test`
  Self-service endpoint for the current user to verify their own company mail account.

- `GET /api/mail/folders`
  Lists IMAP folders for the current user.

- `GET /api/mail/messages?folder=INBOX&page=1&perPage=50&q=`
  Lists messages using IMAP pagination and search where supported.

- `GET /api/mail/messages/{messageId}?folder=INBOX`
  Reads a single message.

- `POST /api/mail/send`
  Sends compose, reply, and forward messages through the current user's SMTP account.

Responses should normalize provider differences and return predictable frontend types.

## Mail Transport Rules

IMAP:

- Use TLS/SSL based on `imapSecurity`.
- Use pagination and avoid fetching full bodies for the message list.
- Fetch full body only when opening a message.
- Use timeout handling for network operations.
- Treat message IDs as folder-scoped. The frontend must pass the folder with the message ID.

SMTP:

- Use TLS/SSL based on `smtpSecurity`.
- Use the configured company display name and company mail address as the sender.
- Do not allow the frontend to spoof `From`.
- Validate recipient addresses before sending.
- Disable duplicate sends by locking the send button on the frontend and handling idempotency where practical.

## HTML Email Safety

Incoming HTML email must be handled cautiously:

- Prefer sanitized HTML rendering.
- Block external remote images by default.
- Provide an "allow remote images for this message" action only when safe HTML rendering is implemented in a follow-up phase.
- Strip scripts, event handlers, iframes, and unsafe URLs.
- Plain text fallback should be available when sanitized HTML is empty or unsafe.

The first implementation may choose to render plain text only if safe HTML rendering is too large for the first phase.

## CRM Integration

Recipient autocomplete should search:

- CRM B2B contacts.
- CRM B2B accounts with email addresses.
- Existing customer records with email addresses.

Result labels should include:

- Name.
- Email.
- Company or account name.
- Source type.

When an outgoing email matches a CRM record:

- Create an activity with type `email`.
- Include subject, recipient email, timestamp, and sender username.
- Link the activity to the contact, account, or customer where possible.

## Error Handling

Expected errors and UI treatment:

- Missing credential key: show "mail encryption is not configured" to admins.
- Missing account: show setup state.
- Invalid password: set account status to `needs_password`.
- IMAP connection failure: keep the page usable and show retry.
- SMTP send failure: keep the compose draft open and show the send error.
- Message fetch failure: keep list selected and show reader error.
- CRM activity logging failure after send: show email sent, but warn that CRM activity was not logged.

## Permissions

Access Control:

- Admin roles can create and update another user's company mail account.
- Regular users should not receive another user's company mail account details.
- The existing profile email and company mail account fields are independent.

Mail page:

- The logged-in user can only use their own company mail account.
- The backend derives the account from the auth token, not from a user-controlled username parameter.
- First-use setup can only create or update the authenticated user's own `companyMailAccount`.

## Testing Strategy

Backend tests should cover:

- Password encryption never returns secrets.
- Missing encryption key fails safely.
- Updating company mail account without password preserves existing credential.
- Password mismatch is rejected.
- Profile email changes do not alter company mail settings.
- Company mail changes do not alter profile email.
- Current-user mail endpoints cannot access another user's account.
- SMTP send uses the authenticated user's account.
- CRM activity logging is attempted after successful send.

Frontend tests or focused verification should cover:

- Access Control renders company mail account status without password.
- New password and confirm password validation.
- `/mail` first-use setup saves company mail settings after a successful connection test.
- `/mail` does not prefill or send the stored profile email as the company mail password identity unless the user explicitly enters the same address.
- Mail page states: not configured, needs password, failed, loading, ready.
- Compose autocomplete selects CRM contacts.
- Send button disables while sending.

## Rollout Plan

Phase 1:

- Add per-user company mail account storage and Access Control UI.
- Add connection test.
- Add `/mail` shell with account state handling and first-use setup.
- Add SMTP send with CRM recipient autocomplete.

Phase 2:

- Add IMAP folder and inbox read-only browsing.
- Add message reader with safe body rendering.
- Add reply and forward from selected message.

Phase 3:

- Add mailbox mutation actions such as mark read, archive, delete, junk, and move.
- Add attachment support.
- Add optional mail server plan using mailcow if PlaNeat decides in a separate infrastructure project to host company email itself.

## Success Criteria

- A user with a verified company mail account can open `/mail` and see their own inbox or connection state.
- A user can compose an email to a CRM contact and send it through their own company SMTP account.
- The browser never receives stored mail passwords.
- Admins can update and retest a user's company mail account from Access Control.
- Existing modules such as CRM, Expense, Chat, Login, and system SMTP notifications continue to work unchanged.
