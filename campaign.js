/*
 * Campaign subscription page: plan cards -> login -> Review & Pay -> Razorpay (through AccessType) -> Success / Failure.
 *
 * Runs on a CMS page (/pages/<slug>) of the newspaper's own site, so it can read the site's login cookies and call the
 * site's own routes. The flow is the one the React /subscribe page runs in the browser
 * (tpml-dh app/isomorphic/components/pages/subscribe-page/index.js: handlePlanSelect, handlePay), without React.
 *
 * Anywhere else (GitHub Pages, localhost) it runs in PREVIEW mode: real plans from AccessType, no login, no payment.
 *
 * Per-campaign settings come from window.DH_CAMPAIGN (set in the page before this script).
 */
(() => {
  'use strict';

  const root = document.getElementById('dh-campaign');
  if (!root) return;

  // ---------------------------------------------------------------------------
  // Sites. Keys and routes checked on 30 Oct 2026 (live: the sites' own requests; dev: its page config).
  // ---------------------------------------------------------------------------
  const DH_TEXT = {
    publisher: 'Deccan Herald',
    whatsappLink: 'https://api.whatsapp.com/send/?phone=919035267305&text=Hi%2C%20I%20need%20assistance%20with%20my%20Deccan%20Herald%20Premium%20Subscription.%20Could%20you%20please%20help%20me%3F&type=phone_number&app_absent=0',
    whatsappNumber: '+91 9035267305',
    emailLink: 'https://mail.google.com/mail/u/0/?fs=1&to=support@deccanherald.com&su=Support%20Required%20for%20DH%20subscription&body=Hi%2C%20I%20need%20assistance%20with%20my%20Deccan%20Herald%20Premium%20Subscription.%20Could%20you%20please%20help%20me%3F&tf=cm',
    emailId: 'support@deccanherald.com'
  };
  const SITES = {
    'www.deccanherald.com': {
      sso: 'https://web.tpml.in', passRoute: '/auth/accesstype-dh-token',
      accessTypeKey: 'WVXWA5UYqHx2oGx3CZDBVeHa', cookieDomain: '.deccanherald.com', text: DH_TEXT
    },
    'dev.deccanherald.com': {
      sso: 'https://web-dev.tpml.in', passRoute: '/auth/accesstype-dh-token',
      accessTypeKey: 'nBX5K3Z2JAaFD5As78im28dh', cookieDomain: '.deccanherald.com', text: DH_TEXT
    },
    // Quintype's own address for the same sandbox site (publisher 7554). Cookies can only be host-only here.
    'dh-sandbox-web.quintype.io': {
      sso: 'https://web-dev.tpml.in', passRoute: '/auth/accesstype-dh-token',
      accessTypeKey: 'nBX5K3Z2JAaFD5As78im28dh', cookieDomain: null, text: DH_TEXT, plansFrom: 'dev.deccanherald.com'
    },
    // PV: routes and key checked; the support contacts below are DH's until PV confirms its own.
    'www.prajavani.net': {
      sso: 'https://web.tpml.in', passRoute: '/auth/accesstype-pv-token',
      accessTypeKey: 'vMyvRVh97dcV4nDspcBBXyKq', cookieDomain: '.prajavani.net',
      text: { ...DH_TEXT, publisher: 'Prajavani' }
    }
  };

  // Screen text from DH's SUBSCRIBE_PAGE_TEXT (tpml-dh app/isomorphic/constants.js).
  const TEXT = {
    REVIEW_TITLE: 'Review & Pay',
    EDIT: 'Edit',
    START_DATE: 'Start Date: ',
    END_DATE: 'End Date: ',
    AMOUNT_LABEL: 'Amount ',
    AMOUNT_TAX: '(Inclusive Of Taxes)',
    RENEWAL_TEXT: 'Your Subscription Renews Automatically, Cancel Anytime.',
    PROCEED_TO_PAY: 'Proceed To Pay',
    LOGIN_PREFIX: 'Logged in as ',
    CHANGE_ACCOUNT: 'Change Account',
    SUCCESS_TITLE: 'Payment Successful!',
    SUCCESS_SUBTITLE: 'Welcome! Your subscription is now active.',
    REDIRECT_PREFIX: 'You will be redirected to ',
    REDIRECT_IN: ' in ',
    REDIRECT_SUFFIX: ' seconds...',
    FAILURE_TITLE: 'Payment Failed!',
    FAILURE_MSG: 'Your payment was unsuccessful. Please try again or use a different mode of payment..',
    RETRY_CTA: 'Retry Payment',
    REVIEW_CTA: 'Go Back & Review',
    RETURN_LINK: 'Go to ',
    CONTACT_PREFIX: 'Facing Issues? ',
    CONTACT_SUFFIX: 'Contact us',
    TIMING_TITLE: 'Working hours',
    TIMING_TEXT: 'Mon - Fri : 10:00 AM to 6:00 PM',
    // Not in DH's constants: the page's own messages.
    VERIFY_TITLE: 'Verifying Your Payment',
    VERIFY_MSG: 'We are verifying your payment and subscription, the process may take a few minutes.',
    VERIFY_SLOW: 'This is taking longer than usual. If money was taken, your subscription will start shortly and you will get an email. You can also contact us below.',
    ALREADY_SUBSCRIBED: 'You already have an active Subscription!',
    CHECK_FAILED: 'We couldn’t confirm your account just now.',
    TRY_AGAIN: 'Try again',
    PLANS_FAILED: 'Plans could not be loaded. Please refresh the page.',
    NO_PLANS: 'No plans are set up for this page yet.',
    SUBSCRIBE: 'Subscribe',
    CURRENT_PLAN: 'Current Plan',
    VALID_TILL: 'Valid till ',
    SUBSCRIBED_TO: 'You are subscribed to '
  };

  const CONFIG = window.DH_CAMPAIGN || {};
  const query = new URLSearchParams(location.search);
  const site = SITES[location.hostname] || null;
  const preview = !site;
  // In preview, plans come from the site named by ?site= (default: CONFIG.previewSite, else dev DH).
  const dataHost = site ? location.hostname : (query.get('site') || CONFIG.previewSite || 'dev.deccanherald.com');
  const dataSite = SITES[dataHost] || SITES['dev.deccanherald.com'];
  const siteText = dataSite.text;
  const planIds = ((CONFIG.plans || {})[dataHost] || (CONFIG.plans || {})[dataSite.plansFrom] || []).map(String);
  const slug = CONFIG.slug || 'campaign';
  const returnUrl = CONFIG.returnUrl || '/premium'; // after success, and "Go to <publisher>"; /subscribe also defaults to /premium
  const PENDING_KEY = 'dhc_pending_plan';

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function track(event, data = {}) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event, campaign: slug, ...data });
  }
  function readCookie(name) {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : '';
  }
  function storage(kind) {
    try { return window[kind]; } catch { return null; }
  }

  // ---------------------------------------------------------------------------
  // Login: same cookies and storage as the main site (tpml-dh helper/utils.js setAuthCookie, addTokensToLocalStorage)
  // ---------------------------------------------------------------------------
  const isLoggedIn = () => Boolean(readCookie('st-refresh-token'));
  function tokenExpiry(token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload.exp ? new Date(payload.exp * 1000) : null;
    } catch { return null; }
  }
  function saveLogin(access, refresh) {
    const write = (name, value) => {
      const expiry = tokenExpiry(value);
      document.cookie = `${name}=${encodeURIComponent(value)}; Path=/${site.cookieDomain ? `; Domain=${site.cookieDomain}` : ''}; Secure; SameSite=Lax`
        + (expiry ? `; Expires=${expiry.toUTCString()}` : '');
    };
    write('st-access-token', access);
    write('st-refresh-token', refresh);
    document.cookie = `qt-auth=${encodeURIComponent(access)}; Path=/; Secure; SameSite=Lax`;
    const local = storage('localStorage');
    try { local?.setItem('access_token', access); local?.setItem('refresh_token', refresh); } catch { /* cookies are enough */ }
  }
  function clearLogin() {
    const expired = 'Expires=Thu, 01 Jan 1970 00:00:00 GMT';
    ['st-access-token', 'st-refresh-token', 'qt-auth'].forEach(name => {
      if (site.cookieDomain) document.cookie = `${name}=; Path=/; Domain=${site.cookieDomain}; ${expired}; Secure; SameSite=Lax`;
      document.cookie = `${name}=; Path=/; ${expired}; Secure; SameSite=Lax`;
    });
    const local = storage('localStorage');
    ['user', 'access_token', 'refresh_token', 'commentsToken', 'last_logged_in_uuid'].forEach(key => { try { local?.removeItem(key); } catch { /* blocked */ } });
  }
  // Back from the login screen with ?access_token=…&refresh_token=… (the service may add a second '?').
  // Save them and take them out of the address before anything else reads it.
  function takeLoginFromAddress() {
    const params = new URLSearchParams(location.search.replace(/\?/g, '&').slice(1));
    const access = (params.get('access_token') || '').replace(/ /g, '+');
    const refresh = (params.get('refresh_token') || '').replace(/ /g, '+');
    if (!access || !refresh) return false;
    saveLogin(access, refresh);
    history.replaceState(null, '', location.pathname + location.hash);
    return true;
  }
  const pageAddress = () => location.origin + location.pathname;
  function startLogin(plan) {
    try { storage('localStorage')?.setItem(PENDING_KEY, JSON.stringify({ id: String(plan.id), slug, at: Date.now() })); } catch { /* reader picks again */ }
    try { storage('sessionStorage')?.setItem('sso_login_initiated_source', `campaign_${slug}`); } catch { /* analytics only */ }
    track('SSO_Page_Open');
    location.assign(`${site.sso}/auth?redirectUrl=${encodeURIComponent(pageAddress())}`);
  }
  function takePendingPlan() {
    const local = storage('localStorage');
    try {
      const pending = JSON.parse(local?.getItem(PENDING_KEY) || 'null');
      local?.removeItem(PENDING_KEY);
      if (pending && pending.slug === slug && Date.now() - pending.at < 30 * 60 * 1000) return pending.id;
    } catch { /* ignore */ }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Site routes and AccessType
  // ---------------------------------------------------------------------------
  function accessToken() {
    try { return readCookie('st-access-token') || localStorage.getItem('access_token') || ''; } catch { return readCookie('st-access-token'); }
  }
  async function refreshLogin() {
    const response = await fetch('/refresh-token', { method: 'POST', headers: { Authorization: `Bearer ${readCookie('st-refresh-token')}` } });
    if (!response.ok) throw new Error(`/refresh-token ${response.status}`);
    const tokens = await response.json();
    if (!tokens['st-access-token'] || !tokens['st-refresh-token']) throw new Error('/refresh-token returned no tokens');
    saveLogin(tokens['st-access-token'], tokens['st-refresh-token']);
  }
  // Calls a site route with the reader's token; on 401 refreshes the login once and retries.
  async function withLogin(request) {
    let response = await request(accessToken());
    if (response.status === 401) {
      await refreshLogin();
      response = await request(accessToken());
    }
    if (!response.ok) throw new Error(`${response.url} ${response.status}`);
    return response;
  }
  async function getUser() {
    const response = await withLogin(token => fetch(`/get-user-details?timestamp=${Date.now()}`, { headers: { Authorization: `Bearer ${token}` } }));
    const details = await response.json();
    const user = details?.userData || details || {};
    return {
      id: user.id || details?.id || '',
      email: user.emails?.[0] || user.email || details?.email || '',
      phone: user.phoneNumbers?.[0] || user.phone || details?.phone || '',
      name: details?.metadata?.first_name || details?.name || user.name || ''
    };
  }
  // tpml-dh pages/subscription-page/auth-client.js requestAccessTypeDhToken
  async function getAccessTypeJwt() {
    const response = await withLogin(token => fetch(site.passRoute, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } }));
    const data = await response.json().catch(() => ({}));
    const jwt = String(data.token || data.jwt || data.accesstypeJwt || data.accessTypeToken
      || response.headers.get('x-integration-token') || response.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!jwt) throw new Error('AccessType JWT missing from the pass route');
    return jwt;
  }
  let accessTypeLoading;
  function loadAccessType() {
    if (window.AccessType) return Promise.resolve();
    accessTypeLoading ||= new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://www.accesstype.com/frontend/v2/accesstype.js?key=${site.accessTypeKey}`;
      script.async = true;
      script.onload = () => (window.AccessType ? resolve() : reject(new Error('AccessType did not load')));
      script.onerror = () => { accessTypeLoading = null; reject(new Error('AccessType script failed')); };
      document.body.append(script);
    });
    return accessTypeLoading;
  }
  async function setAccessTypeUser(user) {
    const [jwt] = await Promise.all([getAccessTypeJwt(), loadAccessType()]);
    await window.AccessType.setUser({ emailAddress: user.email, mobileNumber: user.phone, accesstypeJwt: jwt });
  }
  // AccessType answers 404 for a reader who never subscribed: treat errors here as "no subscriptions", as the sites do.
  async function getSubscriptions() {
    const result = await window.AccessType.getSubscriptions().catch(() => []);
    return Array.isArray(result) ? result : result?.subscriptions || [];
  }
  // Active, or cancelled but paid up (tpml-dh subscribe-page/utils/subscription-state.js).
  function subscriptionActive(sub) {
    const status = String(sub?.status || '').toLowerCase();
    if (status === 'active') return true;
    if (status !== 'cancelled' && sub?.cancelled !== true) return false;
    const end = sub.end_timestamp || sub.end_date || sub.previous_end_timestamp;
    return Boolean(end) && new Date(end).getTime() > Date.now();
  }

  // One account check per page view: 'logged-out' | 'subscriber' | 'not-subscriber' | 'error'.
  const state = { plans: [], user: null, activeSubs: [], paying: false, plan: null, view: 'loading' };
  let accountCheck;
  function accountStatus() {
    if (!isLoggedIn()) return Promise.resolve('logged-out');
    accountCheck ||= (async () => {
      state.user = await getUser();
      await setAccessTypeUser(state.user);
      const subs = await getSubscriptions();
      state.hadSubscriptions = subs.length > 0; // purchase event: 'new user' or 'returning user'
      state.activeSubs = subs.filter(subscriptionActive);
      return subs.some(subscriptionActive) ? 'subscriber' : 'not-subscriber';
    })().catch(error => {
      console.warn('[campaign] Account check failed:', error);
      accountCheck = null;
      return 'error';
    });
    return accountCheck;
  }

  // ---------------------------------------------------------------------------
  // Plans: AccessType's public plan list for the site's key, filtered to this campaign's plan IDs in their order.
  // Hidden plans (no "visibility: show") are fine here: that rule is only a filter in /subscribe.
  // ---------------------------------------------------------------------------
  async function loadPlans() {
    const response = await fetch(`https://www.accesstype.com/api/v1/subscription_groups.json?key=${dataSite.accessTypeKey}`);
    if (!response.ok) throw new Error(`AccessType plans ${response.status}`);
    const groups = (await response.json()).subscription_groups || [];
    const byId = new Map();
    groups.forEach(group => (group.subscription_plans || []).forEach(plan => {
      if (plan.enabled === false || plan.deleted_at) return;
      byId.set(String(plan.id), { ...plan, group_name: group.name });
    }));
    const missing = planIds.filter(id => !byId.has(id));
    if (missing.length) console.warn('[campaign] Plans not found or disabled in AccessType:', missing.join(', '));
    return planIds.map(id => byId.get(id)).filter(Boolean);
  }
  const findPlan = id => state.plans.find(plan => String(plan.id) === String(id));
  const priceCents = plan => plan?.discounted_price_cents ?? plan?.price_cents ?? 0;
  const currencySymbol = plan => (plan?.price_currency === 'INR' ? '₹' : plan?.price_currency === 'USD' ? '$' : '');
  function attribute(plan, name) {
    const attrs = plan?.custom_attributes;
    if (Array.isArray(attrs)) return attrs.find(a => String(a.name || '').toLowerCase() === name)?.value;
    if (attrs && typeof attrs === 'object') return attrs[name] ?? attrs[name[0].toUpperCase() + name.slice(1)];
    return undefined;
  }
  // Plan name in analytics events, as /subscribe sends it.
  function planName(plan) {
    const unit = String(plan?.duration_unit || 'year').toLowerCase().replace(/s$/, '');
    const name = `${plan?.duration_length || 1}-${unit}`;
    return plan?.title || (name === '1-month' ? 'monthly' : name);
  }
  // Rich-text description from AccessType: keep only simple formatting tags.
  function safeRichText(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    const allowed = new Set(['P', 'UL', 'OL', 'LI', 'STRONG', 'B', 'EM', 'I', 'BR', 'SPAN']);
    [...template.content.querySelectorAll('*')].reverse().forEach(el => {
      if (!allowed.has(el.tagName)) { el.replaceWith(...el.childNodes); return; }
      [...el.attributes].forEach(attr => el.removeAttribute(attr.name));
    });
    return template.innerHTML;
  }
  const planEventData = plan => ({
    uuid: state.user?.id || 'NA',
    plan_name: planName(plan),
    plan_price: plan?.price_cents ? plan.price_cents / 100 : 'NA',
    currency: plan?.price_currency || 'INR'
  });

  // ---------------------------------------------------------------------------
  // Address: ?q=review&plan_id=… like /subscribe, so Back leaves the review screen.
  // ---------------------------------------------------------------------------
  function setAddress(q, planId, push) {
    const params = new URLSearchParams(location.search);
    ['q', 'plan_id'].forEach(key => params.delete(key));
    if (q) params.set('q', q);
    if (planId) params.set('plan_id', planId);
    const search = params.toString();
    const url = location.pathname + (search ? `?${search}` : '') + location.hash;
    history[push ? 'pushState' : 'replaceState']({ dhc: q || 'landing' }, '', url);
  }

  // ---------------------------------------------------------------------------
  // Icons (tpml-dh subscribe-page/*/icons.js, atoms/social-media-icons)
  // ---------------------------------------------------------------------------
  const ICONS = {
    back: '<svg class="dhc-backIcon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true"><path d="M5.25938 12.375L12.9594 20.075L11 22L0 11L11 0L12.9594 1.925L5.25938 9.625H22V12.375H5.25938Z" fill="#444444"/></svg>',
    edit: '<svg class="dhc-editIcon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M1.26389 10.1111H2.16441L8.34167 3.93385L7.44115 3.03333L1.26389 9.21059V10.1111ZM0 11.375V8.68924L8.34167 0.363368C8.46805 0.247512 8.60761 0.157986 8.76033 0.0947917C8.91305 0.0315972 9.07367 0 9.24219 0C9.41071 0 9.57396 0.0315972 9.73194 0.0947917C9.88993 0.157986 10.0269 0.252778 10.1427 0.379167L11.0116 1.26389C11.138 1.37975 11.2302 1.51667 11.2881 1.67465C11.346 1.83264 11.375 1.99063 11.375 2.14861C11.375 2.31713 11.346 2.47775 11.2881 2.63047C11.2302 2.78319 11.138 2.92274 11.0116 3.04913L2.68576 11.375H0ZM7.88351 3.49149L7.44115 3.03333L8.34167 3.93385L7.88351 3.49149Z" fill="#C78D3C"/></svg>',
    success: '<svg class="dhc-successIcon" xmlns="http://www.w3.org/2000/svg" width="102" height="102" viewBox="0 0 102 102" fill="none" aria-hidden="true"><circle opacity="0.15" cx="51" cy="51" r="51" fill="#00D372"><animate attributeName="opacity" values="0.2;0.1;0.2" dur="2s" repeatCount="indefinite"/></circle><circle cx="51" cy="51" r="29" fill="#1E894D"><animate attributeName="opacity" values="0.9;0.5;0.9" dur="2s" repeatCount="indefinite"/></circle><mask id="dhc_mask_success" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="29" y="28" width="45" height="45"><rect x="29.4639" y="28.464" width="44.536" height="44.536" fill="#D9D9D9"/></mask><g mask="url(#dhc_mask_success)"><path d="M48.0206 58.8971L40.5979 51.4744L43.1958 48.8765L48.0206 53.7012L60.268 41.4538L62.8659 44.0517L48.0206 58.8971Z" fill="white"/></g></svg>',
    failure: '<svg class="dhc-innerIcon" xmlns="http://www.w3.org/2000/svg" width="102" height="102" viewBox="0 0 102 102" fill="none" aria-hidden="true"><circle opacity="0.15" cx="51" cy="51" r="51" fill="#F23D3D"><animate attributeName="opacity" values="0.15;0.5;0.15" dur="2s" repeatCount="indefinite"/></circle><circle cx="51" cy="51" r="29" fill="#F23D3D"><animate attributeName="opacity" values="0.15;0.5;0.15" dur="2s" repeatCount="indefinite"/></circle><mask id="dhc_mask_failure" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="29" y="28" width="45" height="45"><rect x="29.4639" y="28.464" width="44.536" height="44.536" fill="#D9D9D9"/></mask><g mask="url(#dhc_mask_failure)"><path d="M49.8762 54.4433V37.7423H53.5876V54.4433H49.8762ZM49.8762 63.7217V60.0103H53.5876V63.7217H49.8762Z" fill="white"/></g></svg>',
    ringOuter: '<svg class="dhc-outerCircle" xmlns="http://www.w3.org/2000/svg" width="546" height="546" viewBox="0 0 546 546" fill="none" aria-hidden="true"><path opacity="0.4" fill-rule="evenodd" clip-rule="evenodd" d="M273 541C421.012 541 541 421.012 541 273C541 124.988 421.012 5 273 5C124.988 5 5 124.988 5 273C5 421.012 124.988 541 273 541ZM273 546C423.774 546 546 423.774 546 273C546 122.226 423.774 0 273 0C122.226 0 0 122.226 0 273C0 423.774 122.226 546 273 546Z" fill="#F00"/></svg>',
    ringMiddle: '<svg class="dhc-middleCircle" xmlns="http://www.w3.org/2000/svg" width="496" height="496" viewBox="0 0 496 496" fill="none" aria-hidden="true"><path opacity="0.05" fill-rule="evenodd" clip-rule="evenodd" d="M248 491.458C382.458 491.458 491.458 382.458 491.458 248C491.458 113.542 382.458 4.54212 248 4.54212C113.542 4.54212 4.54212 113.542 4.54212 248C4.54212 382.458 113.542 491.458 248 491.458ZM248 496C384.967 496 496 384.967 496 248C496 111.033 384.967 0 248 0C111.033 0 0 111.033 0 248C0 384.967 111.033 496 248 496Z" fill="#F00"/></svg>',
    retry: '<svg class="dhc-buttonIcon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12.05 20C9.81667 20 7.91667 19.225 6.35 17.675C4.78333 16.125 4 14.2333 4 12V11.825L2.4 13.425L1 12.025L5 8.025L9 12.025L7.6 13.425L6 11.825V12C6 13.6667 6.5875 15.0833 7.7625 16.25C8.9375 17.4167 10.3667 18 12.05 18C12.4833 18 12.9083 17.95 13.325 17.85C13.7417 17.75 14.15 17.6 14.55 17.4L16.05 18.9C15.4167 19.2667 14.7667 19.5417 14.1 19.725C13.4333 19.9083 12.75 20 12.05 20ZM19 15.975L15 11.975L16.4 10.575L18 12.175V12C18 10.3333 17.4125 8.91667 16.2375 7.75C15.0625 6.58333 13.6333 6 11.95 6C11.5167 6 11.0917 6.05 10.675 6.15C10.2583 6.25 9.85 6.4 9.45 6.6L7.95 5.1C8.58333 4.73333 9.23333 4.45833 9.9 4.275C10.5667 4.09167 11.25 4 11.95 4C14.1833 4 16.0833 4.775 17.65 6.325C19.2167 7.875 20 9.76667 20 12V12.175L21.6 10.575L23 11.975L19 15.975Z" fill="white"/></svg>',
    whatsapp: '<svg width="18" height="18" viewBox="0 0 28 28" fill="none" aria-hidden="true" style="flex-shrink:0"><path fill-rule="evenodd" clip-rule="evenodd" d="M23.9202 4.06584C21.2885 1.44525 17.7882 0.00132957 14.0588 0C6.37397 0 0.119658 6.21909 0.116984 13.8635C0.115647 16.3072 0.758058 18.6925 1.97804 20.7946L0 27.9796L7.39072 26.0517C9.4269 27.1566 11.7198 27.7383 14.0528 27.739H14.0588C21.7423 27.739 27.9974 21.5192 28 13.8748C28.0013 10.17 26.5527 6.6871 23.9202 4.0665V4.06584ZM14.0588 25.3975H14.0541C11.9751 25.3969 9.93564 24.8411 8.15617 23.7914L7.73299 23.5415L3.34709 24.6856L4.5176 20.4329L4.24218 19.9968C3.08236 18.162 2.46937 16.0413 2.4707 13.8642C2.47338 7.51078 7.67149 2.34138 14.0635 2.34138C17.1586 2.34271 20.0678 3.54266 22.2557 5.72117C24.4437 7.89902 25.6476 10.7949 25.6463 13.8735C25.6436 20.2275 20.4455 25.3969 14.0588 25.3969V25.3975ZM20.4147 16.7673C20.0664 16.5938 18.3538 15.7561 18.0343 15.6405C17.7147 15.5248 17.4828 15.467 17.2508 15.814C17.0189 16.161 16.3511 16.9415 16.1478 17.1721C15.9446 17.4035 15.7414 17.4321 15.3931 17.2585C15.0449 17.085 13.9225 16.7194 12.5915 15.5394C11.5561 14.6206 10.8568 13.4866 10.6536 13.1395C10.4504 12.7925 10.6322 12.605 10.806 12.4329C10.9624 12.2773 11.1543 12.028 11.3287 11.8259C11.5033 11.6238 11.5607 11.4789 11.677 11.2482C11.7934 11.0168 11.7352 10.8148 11.6483 10.6412C11.5614 10.4677 10.8649 8.76253 10.574 8.06918C10.2912 7.39377 10.0039 7.48551 9.79059 7.47421C9.58736 7.46424 9.35542 7.46225 9.12279 7.46225C8.89016 7.46225 8.51309 7.54867 8.19358 7.89569C7.87407 8.24267 6.97426 9.08097 6.97426 10.7855C6.97426 12.49 8.22236 14.1381 8.39681 14.3694C8.57127 14.6008 10.8534 18.0995 14.3476 19.6006C15.1786 19.9576 15.8276 20.171 16.3336 20.3306C17.168 20.5945 17.9273 20.5573 18.5276 20.4682C19.1968 20.3685 20.5886 19.6299 20.8787 18.8208C21.1688 18.0117 21.1688 17.3177 21.0819 17.1734C20.995 17.0292 20.7624 16.9421 20.4141 16.7686L20.4147 16.7673Z" fill="#25D366"/></svg>',
    mail: '<svg width="16" height="13" viewBox="0 0 20 16" fill="none" aria-hidden="true" style="flex-shrink:0"><path d="M2 16C1.45 16 0.979167 15.8042 0.5875 15.4125C0.195833 15.0208 0 14.55 0 14V2C0 1.45 0.195833 0.979167 0.5875 0.5875C0.979167 0.195833 1.45 0 2 0H18C18.55 0 19.0208 0.195833 19.4125 0.5875C19.8042 0.979167 20 1.45 20 2V14C20 14.55 19.8042 15.0208 19.4125 15.4125C19.0208 15.8042 18.55 16 18 16H2ZM10 9L2 4V14H18V4L10 9ZM10 7L18 2H2L10 7ZM2 4V2V14V4Z" fill="#999"/></svg>'
  };
  const spinner = () => '<div class="dhc-loader-container"><div class="dhc-loader"></div></div>';

  // ---------------------------------------------------------------------------
  // Screens
  // ---------------------------------------------------------------------------
  let countdownTimer;
  function render(html, view) {
    clearInterval(countdownTimer);
    state.view = view;
    const bar = preview
      ? `<div class="dhc-preview-bar">PREVIEW: plans from ${esc(dataHost)}; login and payment only work on the newspaper site.
           Screens: <a href="?q=review${planIds[0] ? `&plan_id=${esc(planIds[0])}` : ''}">review</a><a href="?q=success">success</a><a href="?q=failure">failure</a><a href="?q=verify">verifying</a><a href="?">landing</a><a href="?as=subscriber">as subscriber</a></div>`
      : '';
    root.innerHTML = bar + html;
    window.scrollTo(0, 0);
  }
  function setBusy(busy) {
    root.querySelector('.dhc-overlay-loader')?.remove();
    if (busy) root.insertAdjacentHTML('beforeend', `<div class="dhc-overlay-loader" style="position:fixed">${spinner()}</div>`);
  }
  function notice(html, kind = '') {
    const box = root.querySelector('.dhc-notice-slot');
    if (box) box.innerHTML = html ? `<div class="dhc-notice ${kind ? `dhc-notice--${kind}` : ''}" role="status">${html}</div>` : '';
  }

  function renderLanding(message) {
    const hero = CONFIG.hero || {};
    const cards = state.plans.map(plan => {
      const cents = priceCents(plan);
      const original = plan.discounted_price_cents != null && plan.price_cents > plan.discounted_price_cents ? plan.price_cents : null;
      const per = plan.duration_length ? ` / ${plan.duration_length > 1 ? `${plan.duration_length} ` : ''}${String(plan.duration_unit || '').replace(/s$/, '')}${plan.duration_length > 1 ? 's' : ''}` : '';
      const description = attribute(plan, 'description') || plan.description || '';
      // The reader's own active subscription to this plan: mark it, show till when, and don't offer it again.
      const current = state.activeSubs.find(sub => String(sub.subscription_plan_id) === String(plan.id));
      const validTill = current ? subscriptionEnd(current) : '';
      const button = current
        ? `<button type="button" class="dhc-btn-primary dhc-btn-current" disabled>${esc(TEXT.CURRENT_PLAN)}</button>`
        : `<button type="button" class="dhc-btn-primary" data-action="choose" data-plan="${esc(plan.id)}">${esc(CONFIG.ctaText || TEXT.SUBSCRIBE)}</button>`;
      return `<article class="dhc-plan${current ? ' dhc-plan--current' : ''}">
          ${current ? `<span class="dhc-plan__badge">${esc(TEXT.CURRENT_PLAN)}</span>` : ''}
          <h2 class="dhc-plan__name">${esc(plan.title)}</h2>
          <p class="dhc-plan__price">${currencySymbol(plan)}${esc(cents / 100)}<small>${esc(per)}</small>${original ? `<span class="dhc-plan__strike">${currencySymbol(plan)}${esc(original / 100)}</span>` : ''}</p>
          ${validTill ? `<p class="dhc-plan__valid">${esc(TEXT.VALID_TILL + validTill)}</p>` : ''}
          <div class="dhc-plan__desc">${safeRichText(description)}</div>
          ${button}
        </article>`;
    }).join('');
    render(`<section class="dhc-landing">
        <header class="dhc-hero">
          ${hero.eyebrow ? `<p class="dhc-hero__eyebrow">${esc(hero.eyebrow)}</p>` : ''}
          <h1 class="dhc-hero__title">${esc(hero.title || 'Subscribe')}</h1>
          ${hero.text ? `<p class="dhc-hero__text">${esc(hero.text)}</p>` : ''}
        </header>
        <div class="dhc-notice-slot"></div>
        ${cards ? `<div class="dhc-plans">${cards}</div>` : `<p class="dhc-empty">${esc(TEXT.NO_PLANS)}</p>`}
      </section>`, 'landing');
    if (message) { notice(message.html, message.kind); return; }
    // Subscribed to a plan that isn't on this page: say which, so the reader knows why they can't buy.
    const offPage = state.activeSubs.find(sub => !findPlan(sub.subscription_plan_id));
    if (offPage && !state.activeSubs.some(sub => findPlan(sub.subscription_plan_id))) {
      const till = subscriptionEnd(offPage);
      notice(esc(`${TEXT.SUBSCRIBED_TO}${offPage.plan_name || 'a plan'}${till ? ` (${TEXT.VALID_TILL.toLowerCase()}${till})` : ''}.`));
    }
  }

  // dd/mm/yyyy, as review-page/index.js formatDate and the profile page show dates.
  const formatDate = date => `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  function subscriptionEnd(sub) {
    const end = new Date(sub?.end_timestamp || sub?.end_date || 0);
    return Number.isNaN(end.getTime()) || end.getTime() === 0 ? '' : formatDate(end);
  }
  // review-page/index.js calculateDates
  function planDates(plan) {
    const format = formatDate;
    const start = new Date();
    const end = new Date(start);
    const length = parseInt(plan?.duration_length, 10);
    const unit = String(plan?.duration_unit || '').toLowerCase();
    if (length && unit.includes('day')) end.setDate(end.getDate() + length);
    else if (length && unit.includes('week')) end.setDate(end.getDate() + length * 7);
    else if (length && unit.includes('month')) end.setMonth(end.getMonth() + length);
    else if (length && unit.includes('year')) end.setFullYear(end.getFullYear() + length);
    else end.setFullYear(end.getFullYear() + 1);
    return { start: format(start), end: format(end) };
  }
  function renderReview(plan) {
    state.plan = plan;
    const { start, end } = planDates(plan);
    const cents = priceCents(plan);
    const symbol = currencySymbol(plan);
    const exact = cents > 0 ? `${symbol}${(cents / 100).toFixed(2)}` : '';
    const onButton = cents > 0 ? `${symbol}${cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2)}` : '';
    const account = preview ? 'reader@example.com' : (state.user?.email || state.user?.phone || '');
    render(`<div class="dhc-reviewPageContainer">
        <div class="dhc-headerRow">
          <button type="button" class="dhc-backButton" aria-label="Go Back" data-action="back">${ICONS.back}</button>
          <h1 class="dhc-reviewTitle">${esc(TEXT.REVIEW_TITLE)}</h1>
        </div>
        <div class="dhc-notice-slot"></div>
        <div class="dhc-review-content">
          <div class="dhc-planDetailsBox">
            <div class="dhc-planHeaderRow">
              <h2 class="dhc-planName">${esc(plan.title)}</h2>
              <button type="button" class="dhc-editButton" data-action="edit">${ICONS.edit}<span class="dhc-editText">${esc(TEXT.EDIT)}</span></button>
            </div>
            <div class="dhc-planDates">${esc(TEXT.START_DATE)}${esc(start)}<br>${esc(TEXT.END_DATE)}${esc(end)}</div>
          </div>
          <div class="dhc-paymentDetailsBox">
            <div class="dhc-amountGroup">
              <div class="dhc-totalAmountRow">
                <div class="dhc-totalAmountTextGroup">
                  <span class="dhc-totalAmountLabel">${esc(TEXT.AMOUNT_LABEL)}</span>
                  <span class="dhc-totalAmountTax">${esc(TEXT.AMOUNT_TAX)}</span>
                </div>
                <div class="dhc-totalAmountValue">${esc(exact)}</div>
              </div>
              ${plan.recurring ? `<div class="dhc-renewalText">${esc(TEXT.RENEWAL_TEXT)}</div>` : ''}
            </div>
            <div class="dhc-footerGroup">
              <button type="button" class="dhc-payButton" data-action="pay">${esc(TEXT.PROCEED_TO_PAY)}${onButton ? ` ${esc(onButton)}` : ''}</button>
              <div class="dhc-loginTextRow">
                <span class="dhc-loginPrefix">${esc(TEXT.LOGIN_PREFIX)}</span>
                <span class="dhc-loginEmail">${esc(account)}</span>
                <button type="button" class="dhc-changeAccount" data-action="change-account">${esc(TEXT.CHANGE_ACCOUNT)}</button>
              </div>
            </div>
          </div>
        </div>
      </div>`, 'review');
  }

  function confetti() {
    const colors = ['#22c55e', '#16a34a', '#15803d', '#4ade80', '#86efac', '#fde047', '#facc15', '#eab308'];
    return `<div class="dhc-confetti-layer" aria-hidden="true">${Array.from({ length: 50 }, () => {
      const style = [
        `left:${Math.random() * 100}%`, `animation-delay:${Math.random() * 3}s`, `animation-duration:${Math.random() * 2 + 3}s`,
        `background-color:${colors[Math.floor(Math.random() * colors.length)]}`,
        `width:${Math.random() * 10 + 5}px`, `height:${Math.random() * 5 + 2}px`, `transform:rotate(${Math.random() * 360}deg)`
      ].join(';');
      return `<div class="dhc-confetti" style="${style}"></div>`;
    }).join('')}</div>`;
  }
  function renderSuccess() {
    let seconds = 5;
    render(`<div class="dhc-successPageContainer">
        ${confetti()}
        <div class="dhc-status-content">
          ${ICONS.success}
          <h1 class="dhc-success-title">${esc(TEXT.SUCCESS_TITLE)}</h1>
          <p class="dhc-subtitle">${esc(TEXT.SUCCESS_SUBTITLE)}</p>
          <a class="dhc-redirectAnchor" href="${esc(returnUrl)}"><p class="dhc-redirectText">${esc(TEXT.REDIRECT_PREFIX)}<span class="dhc-redirectLink">${esc(siteText.publisher)}</span>${esc(TEXT.REDIRECT_IN)}<span data-countdown>${seconds}</span>${esc(TEXT.REDIRECT_SUFFIX)}</p></a>
        </div>
      </div>`, 'success');
    if (preview) return; // stay on the screen in preview
    countdownTimer = setInterval(() => {
      seconds -= 1;
      const label = root.querySelector('[data-countdown]');
      if (label) label.textContent = String(Math.max(seconds, 1));
      if (seconds <= 0) { clearInterval(countdownTimer); location.replace(new URL(returnUrl, location.origin).toString()); }
    }, 1000);
  }
  function contactBlock() {
    return `<div class="dhc-contactSection">
        <div class="dhc-contactHeader"><span class="dhc-contactTextRegular">${esc(TEXT.CONTACT_PREFIX)}</span><span class="dhc-contactTextBold">${esc(TEXT.CONTACT_SUFFIX)}</span></div>
        <a class="dhc-contactButton dhc-whatsappBtn" href="${esc(siteText.whatsappLink)}" target="_blank" rel="noopener noreferrer">${ICONS.whatsapp}<span>${esc(siteText.whatsappNumber)}</span></a>
        <a class="dhc-contactButton dhc-mailBtn" href="${esc(siteText.emailLink)}" target="_blank" rel="noopener noreferrer">${ICONS.mail}<span>${esc(siteText.emailId)}</span></a>
        <div class="dhc-timingTitle">${esc(TEXT.TIMING_TITLE)}</div>
        <div class="dhc-timingText">${esc(TEXT.TIMING_TEXT)}</div>
      </div>`;
  }
  function renderFailure() {
    render(`<div class="dhc-failurePageContainer">
        <div class="dhc-contentArea">
          <div class="dhc-clipWrapper"><div class="dhc-ringsBackground">${ICONS.ringOuter}${ICONS.ringMiddle}</div></div>
          <div class="dhc-failure-content">
            ${ICONS.failure}
            <h1 class="dhc-failure-title">${esc(TEXT.FAILURE_TITLE)}</h1>
            <p class="dhc-message">${esc(TEXT.FAILURE_MSG)}</p>
            <div class="dhc-buttonGroup">
              <button type="button" class="dhc-primaryButton" data-action="retry">${ICONS.retry}${esc(TEXT.RETRY_CTA)}</button>
              <button type="button" class="dhc-secondaryButton" data-action="review-again">${esc(TEXT.REVIEW_CTA)}</button>
            </div>
            <button type="button" class="dhc-returnLink" data-action="return">${esc(TEXT.RETURN_LINK + siteText.publisher)}</button>
            ${contactBlock()}
          </div>
        </div>
      </div>`, 'failure');
  }
  function renderVerifying(slow) {
    render(`<div class="dhc-successPageContainer dhc-verifyPageContainer">
        <div class="dhc-status-content">
          ${slow ? '' : '<div class="dhc-loader" style="margin-bottom:22px"></div>'}
          <h1 class="dhc-success-title dhc-verify-title">${esc(TEXT.VERIFY_TITLE)}</h1>
          <p class="dhc-subtitle">${esc(slow ? TEXT.VERIFY_SLOW : TEXT.VERIFY_MSG)}</p>
          ${slow ? contactBlock() : ''}
        </div>
      </div>`, 'verify');
  }

  // ---------------------------------------------------------------------------
  // Flow
  // ---------------------------------------------------------------------------
  async function choosePlan(plan) {
    track('subscription_plan_selection', planEventData(plan));
    if (preview) { openReview(plan); return; }
    if (!isLoggedIn()) { startLogin(plan); return; }
    setBusy(true);
    const status = await accountStatus();
    setBusy(false);
    if (status === 'subscriber') {
      if (state.view !== 'landing') { setAddress(null, null, false); renderLanding(); }
      notice(esc(TEXT.ALREADY_SUBSCRIBED));
      return;
    }
    if (status === 'error') {
      if (state.view !== 'landing') { setAddress(null, null, false); renderLanding(); }
      notice(`${esc(TEXT.CHECK_FAILED)} <button type="button" class="dhc-link" data-action="choose" data-plan="${esc(plan.id)}">${esc(TEXT.TRY_AGAIN)}</button>`, 'error');
      return;
    }
    if (status === 'logged-out') { startLogin(plan); return; }
    openReview(plan);
  }
  function openReview(plan, push = true) {
    if (push) setAddress('review', plan.id, true);
    renderReview(plan);
  }
  function backToLanding() {
    if (history.state?.dhc === 'review') history.back();
    else { setAddress(null, null, false); renderLanding(); }
  }

  // AccessType puts field errors either under error.error or, from the subscription preview, under error.error.message
  // (seen on dev, 30 Oct 2026: error.error.message['payment.from_gateway']). Look in both.
  function errorField(error, key) {
    const [group, field] = key.split('.');
    const places = [error?.error, error?.error?.message, error];
    for (const place of places) {
      if (!place || typeof place !== 'object') continue;
      const value = place[key] ?? place[group]?.[field];
      if (value != null) return value;
    }
    return null;
  }
  const firstOf = value => (Array.isArray(value) ? value[0] : value);
  // Errors that mean "paid, AccessType still confirming" (subscribe-page/index.js handlePay).
  function isVerificationError(error) {
    const gatewayMessage = firstOf(errorField(error, 'payment.from_gateway'))?.message;
    const amountMessage = firstOf(errorField(error, 'payment.amount_cents'));
    const message = [error?.message, error?.error?.message, gatewayMessage].find(value => typeof value === 'string') || '';
    return gatewayMessage === 'Verification failed. Subscription neither active nor authenticated'
      || gatewayMessage === 'Subscription neither active or authenticated'
      || message.includes('0 is not matching subscription plan amount')
      || (typeof amountMessage === 'string' && amountMessage.includes('0 is not matching subscription plan amount'));
  }
  // AccessType rejects with Error objects or plain objects; make either readable in the console and on dev.
  function describeError(error) {
    if (!error) return 'unknown error';
    const parts = [error.name, error.message].filter(Boolean);
    let detail = '';
    try {
      // Error objects keep their fields out of JSON; copy them over (but not the stack). Plain objects go as they are.
      const plain = error instanceof Error
        ? Object.fromEntries(Object.getOwnPropertyNames(error).filter(key => key !== 'stack').map(key => [key, error[key]]))
        : error;
      detail = JSON.stringify(plain);
    } catch { /* circular */ }
    if (detail && detail !== '{}') parts.push(detail);
    return parts.join(' | ').slice(0, 1500) || String(error);
  }
  function gatewayError(error) {
    const gateway = firstOf(errorField(error, 'payment.from_gateway'));
    return gateway && typeof gateway === 'object' ? gateway : null;
  }
  function sendEmail(route, body) {
    if (preview || (!body.email && !body.phone)) return Promise.resolve();
    return fetch(route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
  }
  function emailBase(plan) {
    return {
      email: state.user?.email || '', phone: state.user?.phone || '', name: state.user?.name || '',
      plan_name: plan.title || '', payment_amount: priceCents(plan) / 100,
      currencySymbol: currencySymbol(plan)
    };
  }

  async function pay(plan) {
    if (state.paying) return;
    state.paying = true;
    setBusy(true);
    root.querySelectorAll('[data-action="pay"], [data-action="retry"]').forEach(button => { button.disabled = true; });
    const payButton = root.querySelector('[data-action="pay"]');
    if (payButton) payButton.textContent = 'Processing...';
    let res;
    let step = 'start';
    try {
      if (preview) {
        await sleep(800);
        if (query.get('simulate') === 'failure') throw new Error('Preview: simulated failure');
        setAddress('success', null, false);
        renderSuccess();
        return;
      }
      step = 'get-user-details';
      state.user ||= await getUser();
      step = 'accesstype pass + setUser';
      await setAccessTypeUser(state.user); // fresh AccessType pass for every attempt, as /subscribe does
      await sleep(1000);
      step = 'getPaymentOptions';
      const options = await window.AccessType.getPaymentOptions();
      const razorpay = (options?.data || options)?.razorpay;
      if (!razorpay) throw new Error('Razorpay is not offered for this AccessType account');
      const { email, phone, name } = state.user;
      step = 'razorpay.proceed';
      res = await razorpay.proceed({
        type: 'standard',
        plan: { id: plan.id, title: plan.title, price_cents: plan.price_cents },
        payment: {
          payment_type: (plan.recurring || plan.subscription_type === 'recurring' || plan.metadata?.recurring) ? 'razorpay_recurring' : 'razorpay',
          amount_cents: priceCents(plan),
          amount_currency: plan.price_currency
        },
        subscriber: { email, emailAddress: email, phone, mobileNumber: phone, name }
      });
      if (res?.subscription) {
        paid(plan, res);
        return;
      }
      // No subscription and no error (checkout closed): stay on review, as /subscribe does.
    } catch (error) {
      console.error(`[campaign] Payment did not complete at step "${step}":`, error, describeError(error));
      if (isVerificationError(error)) { verify(plan); return; }
      failed(plan, error, res, step);
    } finally {
      state.paying = false;
      setBusy(false);
      if (state.view === 'review') renderReview(plan);
      if (state.view === 'failure') root.querySelectorAll('[data-action="retry"]').forEach(button => { button.disabled = false; });
    }
  }
  function paid(plan, res) {
    track('purchase', {
      ...planEventData(plan),
      plan_price: priceCents(plan) / 100,
      transaction_id: res?.razorpay_payment_id || res?.payment?.id || res?.subscription?.id || 'NA',
      redirection_url: returnUrl,
      user_type: state.hadSubscriptions ? 'returning user' : 'new user'
    });
    sendEmail('/subscription-success-email', {
      ...emailBase(plan),
      end_timestamp: res?.subscription?.end_timestamp || '',
      start_timestamp: res?.subscription?.created_at || '',
      id: res?.subscription?.id || ''
    });
    accountCheck = Promise.resolve('subscriber');
    if (res?.subscription) state.activeSubs = [...state.activeSubs, { subscription_plan_id: plan.id, ...res.subscription }];
    setAddress('success', null, false);
    renderSuccess();
  }
  function failed(plan, error, res, step = '') {
    const gateway = gatewayError(error);
    const reference = gateway?.payload || res?.error?.id || error?.error?.metadata?.payment_id || error?.payment?.id || '';
    sendEmail('/subscription-failure-email', {
      ...emailBase(plan),
      id: reference,
      payment_error: [gateway?.message, error?.error?.message, error?.message].find(value => typeof value === 'string') || ''
    });
    track('payment_failed', { ...planEventData(plan), plan_price: priceCents(plan) / 100, reference_id: reference || 'NA' });
    setAddress('failure', null, state.view !== 'failure'); // a failed retry does not add another history entry
    renderFailure();
    // Not on the live sites: show what AccessType said, for testing.
    if (!location.hostname.startsWith('www.')) {
      root.querySelector('.dhc-message')?.insertAdjacentHTML('afterend',
        `<pre class="dhc-debug" style="white-space:pre-wrap;word-break:break-word;font-size:12px;background:#fff;border:1px solid #F5C2C2;border-radius:6px;padding:8px;margin:12px 0 0;max-width:560px;text-align:left">${esc(`Step: ${step}
${describeError(error)}`)}</pre>`);
    }
  }
  // Paid but not confirmed yet: look for the new subscription every 5 s for up to 2 minutes.
  async function verify(plan) {
    setAddress('verify', null, false);
    renderVerifying(false);
    for (let attempt = 0; attempt < 24; attempt += 1) {
      await sleep(5000);
      const subs = await getSubscriptions().catch(() => []);
      const found = subs.find(sub => subscriptionActive(sub) && String(sub.subscription_plan_id) === String(plan.id));
      if (found) {
        paid(plan, { subscription: found });
        return;
      }
    }
    renderVerifying(true);
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------
  root.addEventListener('click', event => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'choose') {
      const plan = findPlan(target.dataset.plan);
      if (plan) choosePlan(plan);
    } else if (action === 'back') {
      backToLanding();
    } else if (action === 'edit') {
      track('plan_edit', { uuid: state.user?.id || 'NA', from_plan: planName(state.plan), from_price: state.plan?.price_cents ? state.plan.price_cents / 100 : 'NA', currency: state.plan?.price_currency || 'INR' });
      backToLanding();
    } else if (action === 'pay') {
      track('proceed_to_pay_click', planEventData(state.plan));
      pay(state.plan);
    } else if (action === 'retry') {
      track('retry_payment_click', planEventData(state.plan));
      if (state.plan) pay(state.plan); else backToLanding();
    } else if (action === 'review-again') {
      // The failure screen sits on top of the review entry in history: step back to it, so Edit/Back then reach the plans.
      if (history.state?.dhc === 'failure') history.back();
      else if (state.plan) { setAddress('review', state.plan.id, false); renderReview(state.plan); } else backToLanding();
    } else if (action === 'return') {
      location.replace(new URL(returnUrl, location.origin).toString());
    } else if (action === 'change-account') {
      if (preview) return;
      track('logout', { uuid: state.user?.id || 'NA', source: 'change_account' });
      clearLogin();
      setTimeout(() => { location.href = `${site.sso}/auth/logout?redirectUrl=${encodeURIComponent(pageAddress())}`; }, 300);
    }
  });
  // Back/forward between the plan cards and the review screen.
  window.addEventListener('popstate', () => {
    if (state.paying) return;
    const params = new URLSearchParams(location.search);
    const plan = params.get('q') === 'review' && findPlan(params.get('plan_id'));
    if (plan && (preview || isLoggedIn())) renderReview(plan);
    else renderLanding();
  });

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------
  async function start() {
    if (!preview) takeLoginFromAddress();
    render(spinner(), 'loading');
    if (!preview) accountStatus(); // start early, so the answer is ready when the reader taps
    try {
      state.plans = await loadPlans();
    } catch (error) {
      console.warn('[campaign]', error);
      render(`<section class="dhc-landing"><div class="dhc-notice dhc-notice--error">${esc(TEXT.PLANS_FAILED)}</div></section>`, 'error');
      return;
    }
    track('campaign_page_view', { plans: state.plans.map(plan => plan.id).join(',') });

    const q = query.get('q');
    if (preview && q) { // design check of each screen
      const plan = findPlan(query.get('plan_id')) || state.plans[0];
      state.plan = plan;
      if (q === 'review' && plan) { renderReview(plan); return; }
      if (q === 'success') { renderSuccess(); return; }
      if (q === 'failure') { renderFailure(); return; }
      if (q === 'verify') { renderVerifying(query.get('slow') === '1'); return; }
    }

    // Back from login with a plan picked, or a reload of the review screen: carry on to review.
    const pendingId = preview ? null : takePendingPlan();
    const reviewId = q === 'review' ? query.get('plan_id') : null;
    setAddress(null, null, false);
    if (preview && query.get('as') === 'subscriber' && state.plans[0]) { // design check of the subscriber view
      const end = new Date(); end.setFullYear(end.getFullYear() + 1);
      state.activeSubs = [{ subscription_plan_id: state.plans[0].id, plan_name: state.plans[0].title, status: 'active', end_timestamp: end.toISOString() }];
    }
    renderLanding();
    // The account check finishes after the cards are drawn: redraw them so the reader's current plan is marked.
    if (!preview) accountStatus().then(() => { if (state.view === 'landing' && !state.paying && state.activeSubs.length) renderLanding(); });
    const resume = findPlan(pendingId || reviewId);
    if (resume && isLoggedIn()) choosePlan(resume);
  }
  start();
})();
