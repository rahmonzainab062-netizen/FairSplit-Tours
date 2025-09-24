# FairSplit Tours

A decentralized platform for group tour payments, built on the Stacks blockchain using Clarity smart contracts. FairSplit Tours ensures transparent, fair cost splitting and secure payment handling for group travel.

## ✨ Features
- 🧳 Create and manage group tours with defined costs and participant limits.
- 💸 Automatically split costs fairly among participants, with support for custom roles.
- 🔒 Hold payments in escrow until tour conditions are met.
- ✅ Track tour status and payments transparently on-chain.
- 🔄 Process refunds automatically for cancellations or unfulfilled tours.
- 🛡 Resolve disputes through participant voting.
- 📊 Record detailed expense breakdowns for transparency.

## 🛠 How It Works
### For Organizers
1. Create a tour with total cost, participant limit, and details using `TourRegistry`.
2. Define cost splits (equal or role-based) via `CostSplitter`.
3. Receive funds from `PaymentEscrow` upon tour completion.

### For Participants
1. Join a tour via `ParticipantManager` and pay your share into `PaymentEscrow`.
2. Verify tour details and expenses using `TourStatus` and `ExpenseTracker`.
3. Vote on disputes with `DisputeResolver` or claim refunds via `RefundManager`.

### For Refunds
- If a tour is canceled or fails, `RefundManager` automatically refunds participants.
- Funds are securely held in `PaymentEscrow` until conditions are resolved.
