# Security Specification - Habitect

## Data Invariants
1. A user document must have a UID that matches its path ID.
2. Guest users (those without auth tokens) can only access documents where the path ID starts with `guest_`.
3. Monthly habit data must be linked to a valid user ID.
4. Habits must be stored as an array.
5. All timestamps must be numbers or server timestamps.

## The "Dirty Dozen" Payloads
1. Attempt to create a user doc with someone else's ID.
2. Attempt to update `activeHabits` with a 1MB string instead of an array.
3. Attempt to set `uid` to a non-guest ID while unauthenticated.
4. Attempt to write to a user document that doesn't start with `guest_` while unauthenticated.
5. Attempt to update a user's email without being that user.
6. Attempt to inject shadow fields into a monthly habit document.
7. Attempt to delete another user's habits.
8. Attempt to bypass `isOwner` by passing a fake `uid` in the payload.
9. Attempt to set `streaks` to -1.
10. Attempt to update `createdAt` (immutable).
11. Attempt to list all users (PII leak).
12. Attempt to write a massive array of habits (Denial of Wallet).

## The Test Runner (firestore.rules.test.ts)
```typescript
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { setDoc, getDoc, deleteDoc } from "firebase/firestore";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "habitect-test",
    firestore: {
      rules: fs.readFileSync("firestore.rules", "utf8"),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

test("Guest can manage their own profile", async () => {
  const guestId = "guest_123";
  const unauthedDb = testEnv.unauthenticatedContext().firestore();
  
  const userDoc = {
    uid: guestId,
    displayName: "Guest User",
    email: "guest@example.com",
    birthYear: 1990,
    createdAt: Date.now(),
    stats: { streaks: 0, completions: 0 },
    activeHabits: []
  };

  await assertSucceeds(setDoc(doc(unauthedDb, "users", guestId), userDoc));
});

test("Guest cannot manage someone else's profile", async () => {
  const guestId = "guest_123";
  const otherId = "other_user";
  const unauthedDb = testEnv.unauthenticatedContext().firestore();
  
  await assertFails(setDoc(doc(unauthedDb, "users", otherId), { uid: otherId }));
});
```
