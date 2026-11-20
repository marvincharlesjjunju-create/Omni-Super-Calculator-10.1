# Omni Intelligence

## What this release implements

Omni Intelligence is an offline-first, tool-using computational assistant inside the app. It uses the existing safe mathematical parser and dedicated local functions to route supported natural-language requests to:

- arithmetic and scientific-expression evaluation;
- percentage calculations;
- linear and quadratic equations with real roots;
- reducing-balance loan amortisation;
- a 50/30/20 budget allocation starting point;
- selected length, mass and temperature conversions;
- short educational explanations for compound interest, percentages and statistics.

Conversation history is stored locally in the app's existing local-storage wrapper. Clearing the conversation removes the locally stored chat transcript. No user prompt is sent to a remote service by this implementation.

## Important distinction

This implementation is a deterministic local reasoning and tool-routing system. It is not a trained generative language model and does not claim to answer arbitrary open-ended questions. Unsupported requests receive an honest capability response rather than a fabricated answer.

## Production AI architecture

For a future generative AI tier, add a separately deployed authenticated backend. The mobile client should call that backend, never a provider API directly. Keep provider keys in server-side secrets, validate request size and user identity, apply rate limits, redact sensitive data where appropriate, and define retention controls. The backend can expose a constrained tool interface for calculator, finance, conversion and education tools. Require confirmation before any future tool can create transactions, send messages, or modify external accounts.

## Verification examples

- `What is 18% of 2,450,000?`
- `Solve 2x + 5 = 17`
- `Solve x^2 - 5x + 6 = 0`
- `Calculate a loan of 5,000,000 at 18% annual interest for 12 months`
- `Convert 12 kilometres to miles`
- `Split a budget of 1,000,000 into needs, wants and savings`
- `Explain compound interest with an example`

Loan outputs use a standard monthly reducing-balance formula and exclude lender fees, insurance and other charges. Budget allocations are general starting points, not financial advice.
