import assert from "node:assert/strict";
import test from "node:test";

import { safeAuthRedirect } from "../constants/auth.ts";
import { calculateEqualExpenseSplit, computeLedgerBalances, computeSettlementBatches } from "../lib/ledger.ts";

test("computes a two-person split", () => {
  const balances = computeLedgerBalances(["alice", "bob"], [
    { payerId: "alice", totalAmountPaise: 10000, participantIds: ["alice", "bob"] },
  ]);

  assert.deepEqual(Object.fromEntries(balances), { alice: 5000, bob: -5000 });
});

test("assigns an uneven remainder to the payer's own share", () => {
  const split = calculateEqualExpenseSplit({
    payerId: "alice",
    totalAmountPaise: 10001,
    participantIds: ["alice", "bob", "carol"],
  });
  const balances = computeLedgerBalances(["alice", "bob", "carol"], [
    { payerId: "alice", totalAmountPaise: 10001, participantIds: ["alice", "bob", "carol"] },
  ]);

  assert.equal(split.payerSharePaise, 3335);
  assert.deepEqual(Object.fromEntries(balances), { alice: 6666, bob: -3333, carol: -3333 });
});

test("does not create self-debt when the payer is included", () => {
  const balances = computeLedgerBalances(["alice", "bob"], [
    { payerId: "alice", totalAmountPaise: 1200, participantIds: ["alice", "bob"] },
  ]);

  assert.deepEqual(Object.fromEntries(balances), { alice: 600, bob: -600 });
});

test("batches one debtor across multiple creditors", () => {
  const batches = computeSettlementBatches([
    { userId: "alice", netBalancePaise: -900 },
    { userId: "bob", netBalancePaise: -300 },
    { userId: "carol", netBalancePaise: 800 },
    { userId: "dave", netBalancePaise: 400 },
  ]);

  assert.deepEqual(Object.fromEntries(batches), {
    alice: [
      { creditorId: "carol", amountPaise: 800 },
      { creditorId: "dave", amountPaise: 100 },
    ],
    bob: [{ creditorId: "dave", amountPaise: 300 }],
  });
});

test("nets a cycle into one debtor payment and direct creditor payouts", () => {
  const batches = computeSettlementBatches([
    { userId: "a", netBalancePaise: -70000 },
    { userId: "b", netBalancePaise: 20000 },
    { userId: "c", netBalancePaise: 50000 },
  ]);

  assert.deepEqual(Object.fromEntries(batches), {
    a: [
      { creditorId: "c", amountPaise: 50000 },
      { creditorId: "b", amountPaise: 20000 },
    ],
  });
});

test("keeps auth redirects on the local application origin", () => {
  assert.equal(safeAuthRedirect("/groups/example"), "/groups/example");
  assert.equal(safeAuthRedirect("//evil.example"), "/groups");
  assert.equal(safeAuthRedirect("https://evil.example"), "/groups");
});
