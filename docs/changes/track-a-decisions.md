# Track A execution decisions

Confirmed by the project owner for the autonomous A1–A11 implementation pass:

- A12 cross-chain deposits remain a stretch goal.
- Build dependent tasks on top of completed work without waiting for individual
  prerequisite PR merges. Keep task-sized commits and change records for review.
  This explicitly overrides the earlier per-task merge prerequisite for this pass.
- Invited members may join an existing trip until it ends. Joining never changes
  an existing proposal's participants or shares.
- `totalCap` limits automatic approvals, not explicitly verified wallet approvals.
- Members may withdraw their available, unlocked money at any time.
- Delivery deadlines must be no later than trip end.
- Each member recovers their own unspent funds; one person's money never subsidizes
  another person's purchase or withdrawal.
- World registration/configuration and Arc funding still need setup.
- Angela owns Track B. Pull current work after Track A and continue integration
  where ready; avoid overwriting concurrent work.

Implementation conventions:

- Pending consent does not reserve money. The contract rechecks every balance,
  automatic policy and manual-approval expiry atomically when locking a purchase.
- Automatic eligibility counts the member's fulfilled spend plus current locked
  shares. Withdrawing does not reset spending limits; refunds release commitments.
- Trip end closes new deposits, joins and purchases. Refunds, delivery before its
  deadline and member withdrawals preserve the existing ownership of funds.
- Settlement uses pull withdrawals rather than transferring to every member in
  a loop, so one failing recipient cannot block everyone else's refund.
- Live provider credentials and funded accounts must be real; tests inject local
  providers/accounts explicitly and cannot turn on a production authentication bypass.
