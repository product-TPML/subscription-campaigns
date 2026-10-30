# Campaign subscription page

A subscription page for one campaign that sells one or a few AccessType plans with its own flow. It doesn't use `/subscribe`.
It is plain HTML, CSS and JS with no React, hosted on GitHub Pages and pasted into the newspaper CMS as a `/pages/<slug>` page.

| File | What it is |
|---|---|
| `index.html` | Preview page (GitHub Pages / local). Shows the same markup as the CMS paste. |
| `cms-paste.html` | What goes into the CMS page. The per-campaign settings are in `window.DH_CAMPAIGN`. |
| `campaign.js` | The whole flow. |
| `campaign.css` | Styles. Review & Pay, Success and Failure are ported from DH `subscribe-page/{review-page,success-page,failure-page}/index.m.css`, with classes prefixed `dhc-`. |

## Flow
1. **Plan cards**: AccessType's public plan list (`/api/v1/subscription_groups.json?key=…`), filtered to the campaign's plan IDs.
   Hidden plans work too, because `visibility: show` is only a `/subscribe` filter.
2. **Subscribe tapped, logged out**: the plan is saved in `localStorage` (`dhc_pending_plan`) and the reader goes to `<SSO>/auth?redirectUrl=<this page>`.
   On return the tokens are saved the way the main site saves them (cookies `st-access-token`, `st-refresh-token`, `qt-auth`, plus localStorage) and removed from the address, and the flow carries on to Review.
3. **Logged in**: `/get-user-details` → pass route → `AccessType.setUser` → `getSubscriptions`. Readers who already subscribe see a notice and can't buy.
4. **Review & Pay**: the prod screen. "Proceed To Pay" runs `AccessType.getPaymentOptions()` → `razorpay.proceed(...)`, the same payload as DH `handlePay`.
5. **Success**: `res.subscription` exists. Sends the `purchase` event and `/subscription-success-email`, then redirects to `returnUrl` after 5 s.
6. **Failure**: sends the `payment_failed` event and `/subscription-failure-email`. The screen has Retry, Go Back & Review, and Go to Deccan Herald.
7. **Verifying**: Razorpay paid but AccessType hasn't confirmed yet. The page checks `getSubscriptions` every 5 s for 2 minutes, then shows the support contacts.

Analytics events (`window.dataLayer`): `campaign_page_view`, `subscription_plan_selection`, `SSO_Page_Open`, `proceed_to_pay_click`,
`plan_edit`, `purchase`, `payment_failed`, `retry_payment_click`, `logout`. Each one carries `campaign: <slug>`.

## Sites (`SITES` in campaign.js)
| Host | Login | AccessType key | Pass route |
|---|---|---|---|
| `www.deccanherald.com` | `web.tpml.in` | `WVXWA5UYqHx2oGx3CZDBVeHa` | `/auth/accesstype-dh-token` |
| `dev.deccanherald.com` (sandbox) | `web-dev.tpml.in` | `nBX5K3Z2JAaFD5As78im28dh` | `/auth/accesstype-dh-token` |
| `www.prajavani.net` | `web.tpml.in` | `vMyvRVh97dcV4nDspcBBXyKq` | `/auth/accesstype-pv-token` |

Any other host runs in **preview**: real plans (from `previewSite`, or `?site=<host>`), no login, no payment.
In preview, `?q=review|success|failure|verify` opens each screen, `?q=verify&slow=1` shows the slow version,
and `?simulate=failure` makes Pay fail.

## Testing on dev (do this before live)
- Use a separate browser profile or an incognito window. Dev and www share the `.deccanherald.com` login cookies.
- Sandbox plan 7823 ("Real payment Plan", ₹25, 7 days, recurring). Check with the tech team whether it charges real money.
- Cases to try:
  - logged out → login → back → Review;
  - already subscribed;
  - successful payment;
  - Razorpay closed (should stay on Review);
  - failed payment → Retry;
  - mobile.

## Not covered
- Coupons, upgrades and downgrades (those are `/subscribe` features).
- PV text: the screens are in English, and the support contacts are DH's.
- It's a browser-only flow. AccessType checks the price, but the page relies on the site's routes, cookie names and keys staying the same.
