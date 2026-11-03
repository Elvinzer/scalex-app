# Multi-business browser verification

Date: 2026-11-03. Local Turbopack app, disposable PostgreSQL only. Identity and business names below are synthetic fixtures.

## Verified with the admin identity

- Desktop selector opens under the logo, lists Club VIP Finance, Second Business and Client Business with Owner or Member roles, and marks the current business.
- Selecting Second Business produces `/b/b2222222-2222-4222-8222-222222222222/dashboard` and a fresh client state.
- Two open tabs retain their own scoped URLs. After writing Second Business in tab B, a stale tab A saved `UX stale A after B` to Club VIP Finance. Reloading tab B retained its separate `UX tab B final` value.
- Creating Browser Created Business through the form produced a new independent UUID and navigated to its scoped onboarding, with the admin exemption applied.
- A member with only the business permission sees Business & offers and no owner configuration links. Attempting that business's Datas page redirects to its own Business page, without falling back to an owned business.
- Mobile header displays the business identity; opening the drawer exposes the same selector. At 390px width there was no horizontal document overflow.
- French and English selector/list copy renders as translated text, including the opened popover. English was selected through the real personal settings form. No `businesses.*` or `navigation.*` keys appeared in the visible DOM.
- Switching while an autosave was queued raised: “You have unsaved changes on this page. Switch businesses and leave these changes behind?” Dismissing retained the current business URL.
- Escape closes the selector. Profile menu retains the personal account identity.

## Next runtime checks

`/_next/mcp` responded to `tools/list` and `get_routes`.

Final `get_compilation_issues`: `{"issues":[]}`.

Final `get_errors`: `{"configErrors":[],"sessionErrors":[]}`.

Screenshots in this directory capture the desktop selector, stale-tab save, admin creation, mobile header, French/English mobile selector and restricted member profile menu.

## Verified with the normal owner identity

- Creating Normal Owner New Business navigated to its scoped billing page. Refresh retained the payment choices. The disposable database contained zero subscription rows and onboarding was incomplete for the new business; no additional trial was granted or advertised.
- The pending business dashboard rendered only the recovery message, payment link, business switch and sign-out options. Its operational extension-session POST returned HTTP 403 with `crm_unavailable`.
- Setting only Client Business to past_due with paymentBlockedAt blocked its dashboard. The payment link opened its billing page, showing the outstanding-payment recovery action. Its operational extension-session POST also returned HTTP 403.
- Pending and suspended billing were inspected in both French and English, including visible headings, plan choices and recovery text. No raw translation keys appeared.
- A runtime issue was found and fixed: Next client navigation retained the previous layout decision when moving from a blocker to billing. Recovery links and business-list entry links now use full navigation to refresh the authoritative server shell. The actual payment click and the business-list-to-dashboard click were retested successfully.
- Client Business was restored to active with paymentBlockedAt cleared, and the normal owner's locale was restored to French. The business list opened its operational dashboard with the correct business identity.

No checkout, billing portal, email or vendor request was sent during these browser checks. Screenshot evidence uses only local synthetic fixtures.

## Extension business selection

The actual `/extension/auth/select` page was opened with the normal owner identity. Client Business offered an enabled connection action; the pending additional business showed the translated CRM-unavailable explanation and a disabled action. No raw translation key was visible. Screenshot: `extension-business-selection.png`. Signed completion and renewal paths are also covered by the extension tests and runtime API verifier.
