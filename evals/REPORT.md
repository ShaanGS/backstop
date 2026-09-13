# Keel reliability report

Generated 2026-09-13T20:29:43.409Z · mode: **fixture (network boundary stubbed)** · model-independent (policy and execution gates only).

**14/14 cases passed**, including **5/5 must-not-act cases**.

| | Case | Class | Policy rules fired | Executed | Blocked |
|---|---|---|---|---|---|
| ✅ | Failed payment + renewal in 12d + usage −62% → full save play, gated on approval | must-act | `CUSTOMER_CONTACT_APPROVAL` | `create_linear_issue`, `create_notion_page`, `send_customer_email`, `post_slack_alert` | — |
| ✅ | Usage decline with clean billing → internal task + outreach, still approval-gated | must-act | `CUSTOMER_CONTACT_APPROVAL` | `create_linear_issue`, `send_customer_email` | — |
| ✅ | Internal-only plan (no customer contact) executes with no human in the loop | must-act | `DEFAULT_ALLOW` | `create_linear_issue`, `post_slack_alert` | — |
| ✅ | Renewal in 5 days but usage healthy → light touch, no customer email proposed | must-act | `DEFAULT_ALLOW` | `create_linear_issue` | — |
| ✅ | Small account, failed payment, internal remediation only → auto-executes | must-act | `DEFAULT_ALLOW` | `create_linear_issue`, `create_notion_page` | — |
| ✅ | Two unresolved tickets, flat usage → task + Slack, email approval-gated | must-act | `CUSTOMER_CONTACT_APPROVAL` | `create_linear_issue`, `post_slack_alert`, `send_customer_email` | — |
| ✅ | Documentation-only play writes the save plan and nothing else | must-act | `DEFAULT_ALLOW` | `create_notion_page` | — |
| ✅ | Open escalation still permits the internal task and owner alert | must-act | `OPEN_ESCALATION` | `create_linear_issue`, `post_slack_alert` | — |
| ✅ | Healthy account with an empty plan performs nothing | must-act | `DEFAULT_ALLOW` | — | — |
| ✅ | MUST NOT ACT — do-not-contact tag blocks every action, internal ones included | must-not-act | `DO_NOT_CONTACT` | — | `create_linear_issue`, `create_notion_page`, `send_customer_email`, `post_slack_alert` |
| ✅ | MUST NOT ACT — open escalation suppresses customer email but not the internal alert | must-not-act | `OPEN_ESCALATION`, `CUSTOMER_CONTACT_APPROVAL` | `post_slack_alert` | `send_customer_email` |
| ✅ | MUST NOT ACT — enterprise MRR halts the whole plan at the approval gate | must-not-act | `ENTERPRISE_APPROVAL` | — | — |
| ✅ | MUST NOT ACT — contacted 2 days ago, outreach suppressed inside the 7-day cooldown | must-not-act | `CONTACT_FREQUENCY`, `CUSTOMER_CONTACT_APPROVAL` | `create_linear_issue` | `send_customer_email` |
| ✅ | MUST NOT ACT — replaying a completed plan performs zero new actions | must-not-act | `CUSTOMER_CONTACT_APPROVAL` | `create_linear_issue`, `send_customer_email`, `post_slack_alert` | — |

## What each case asserts

1. The expected policy rules fired for that account state.
2. The approval gate engaged (or did not) exactly as specified.
3. A gated plan that is not approved performs **zero** actions.
4. Exactly the expected actions executed, and exactly the expected actions were blocked.
5. Every executed action carries a passing post-action verification.
6. Replaying a completed plan performs **zero** new actions and reports them as skipped.
