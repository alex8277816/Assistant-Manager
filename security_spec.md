# Firestore Security Specification

## 1. Data Invariants
1. **Strict Ownership Isolation**: Every document in `/users/{userId}`, `/users/{userId}/items/{itemId}`, and `/users/{userId}/backups/{backupId}` may only be read or written by an authenticated user whose `request.auth.uid == userId` and `request.auth.token.email_verified == true`.
2. **Path & ID Integrity**: All document path variables (`userId`, `itemId`, `backupId`) must match `^[a-zA-Z0-9_\-]+$` and be at most 128 characters.
3. **Immutable Ownership & Timestamps**: `ownerId` and `createdAt` are immutable after creation; `createdAt == request.time` on create, `updatedAt == request.time` on update.
4. **Zero-Knowledge Boundary & Size Caps**: All user content is stored as bounded AES-GCM `ciphertext` + `iv` strings with strict length bounds to prevent resource exhaustion / Denial of Wallet attacks.
5. **No Shadow Fields**: Every create enforces `keys().hasAll(...) && keys().hasOnly(...)` and every update enforces `affectedKeys().hasOnly(...)` via named action branches.
6. **Immutable Backup Snapshots**: Cloud backup snapshots in `/users/{userId}/backups/{backupId}` are append-only (`create` and `delete` allowed, `update` forbidden).

## 2. The "Dirty Dozen" Adversarial Payloads
1. Unauthenticated read/write to `/users/alice/items/task1` -> `PERMISSION_DENIED`
2. Cross-user read/list by `bob` on `/users/alice/items` -> `PERMISSION_DENIED`
3. Unverified email user (`email_verified: false`) writing `/users/alice` -> `PERMISSION_DENIED`
4. Identity spoofing: `bob` creating `/users/bob/items/t1` with `ownerId: "alice"` -> `PERMISSION_DENIED`
5. Shadow field injection: creating `/users/alice/items/t1` with extra field `isAdmin: true` -> `PERMISSION_DENIED`
6. Client timestamp spoofing: creating `/users/alice/items/t1` with backdated `createdAt` instead of `request.time` -> `PERMISSION_DENIED`
7. ID poisoning: creating `/users/alice/items/bad$id` with invalid characters or >128 chars -> `PERMISSION_DENIED`
8. Value poisoning / Denial of Wallet: writing `ciphertext` > 200,000 chars on `/users/alice/items/t1` -> `PERMISSION_DENIED`
9. Invalid enum value: setting `kind: "arbitrary"` on item or `themeMode: "neon"` on vault -> `PERMISSION_DENIED`
10. Immutable field mutation: updating `createdAt` or `ownerId` on `/users/alice/items/t1` -> `PERMISSION_DENIED`
11. Unallowed update on backup snapshot: updating `/users/alice/backups/b1` -> `PERMISSION_DENIED`
12. Unmatched collection write: writing to `/admin/config` or `/public/items` -> `PERMISSION_DENIED`
