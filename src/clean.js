'use strict';

/**
 * URL cleaning engine.
 *
 * Every removal carries a plain-language `reason` so the UI (and any future
 * browser extension) can explain what it took off, instead of silently
 * rewriting the link.
 */

/** Exact-match tracking parameters, mapped to what they actually are. */
const EXACT = new Map(Object.entries({
  // Google Analytics / Ads
  gclid: 'Google Ads click ID',
  gclsrc: 'Google Ads click source',
  dclid: 'Google Display click ID',
  gbraid: 'Google Ads web-to-app ID',
  wbraid: 'Google Ads app-to-web ID',
  gad_source: 'Google Ads source tag',
  _ga: 'Google Analytics cross-domain ID',
  _gl: 'Google Analytics link ID',

  // Meta
  fbclid: 'Facebook click ID',
  fb_action_ids: 'Facebook action ID',
  fb_action_types: 'Facebook action type',
  fb_source: 'Facebook referral source',
  fb_ref: 'Facebook referral tag',
  igshid: 'Instagram share ID',
  igsh: 'Instagram share ID',

  // Microsoft / Yandex / Yahoo
  msclkid: 'Microsoft Ads click ID',
  yclid: 'Yandex click ID',
  ysclid: 'Yandex click ID',
  _openstat: 'Openstat campaign tag',
  guccounter: 'Yahoo consent counter',
  guce_referrer: 'Yahoo referrer tag',
  guce_referrer_sig: 'Yahoo referrer signature',

  // TikTok / Twitter / Snap / Reddit / LinkedIn / Pinterest
  ttclid: 'TikTok click ID',
  tt_medium: 'TikTok campaign medium',
  tt_content: 'TikTok campaign content',
  twclid: 'Twitter click ID',
  __twitter_impression: 'Twitter impression flag',
  scid: 'Snapchat click ID',
  rdt_cid: 'Reddit click ID',
  li_fat_id: 'LinkedIn click ID',
  epik: 'Pinterest click ID',

  // Email and marketing platforms
  mc_cid: 'Mailchimp campaign ID',
  mc_eid: 'Mailchimp subscriber ID',
  mkt_tok: 'Marketo tracking token',
  vero_id: 'Vero recipient ID',
  vero_conv: 'Vero conversion ID',
  ml_subscriber: 'MailerLite subscriber ID',
  ml_subscriber_hash: 'MailerLite subscriber hash',
  _hsenc: 'HubSpot encrypted tag',
  _hsmi: 'HubSpot email ID',
  __hssc: 'HubSpot session tag',
  __hstc: 'HubSpot visitor tag',
  __hsfp: 'HubSpot fingerprint',
  hsCtaTracking: 'HubSpot CTA tracking',
  ck_subscriber_id: 'ConvertKit subscriber ID',
  oly_anon_id: 'Omeda anonymous ID',
  oly_enc_id: 'Omeda encrypted ID',
  wickedid: 'WickedReports ID',
  sc_campaign: 'Salesforce campaign tag',
  sc_channel: 'Salesforce channel tag',
  sc_content: 'Salesforce content tag',
  sc_medium: 'Salesforce medium tag',
  sc_outcome: 'Salesforce outcome tag',
  sc_geo: 'Salesforce geo tag',
  sc_country: 'Salesforce country tag',

  // Affiliate and commerce
  irclickid: 'Impact affiliate click ID',
  irgwc: 'Impact affiliate tag',
  cjevent: 'Commission Junction event ID',
  ranMID: 'Rakuten merchant ID',
  ranEAID: 'Rakuten affiliate ID',
  ranSiteID: 'Rakuten site ID',
  affiliate_id: 'Affiliate ID',
  aff_id: 'Affiliate ID',
  click_id: 'Click ID',
  ascsubtag: 'Amazon affiliate subtag',
  asc_campaign: 'Amazon affiliate campaign',
  asc_refurl: 'Amazon affiliate referrer',
  asc_source: 'Amazon affiliate source',
  linkCode: 'Amazon link code',
  creativeASIN: 'Amazon creative ID',
  pd_rd_r: 'Amazon session tag',
  pd_rd_w: 'Amazon session tag',
  pd_rd_wg: 'Amazon session tag',
  pf_rd_p: 'Amazon placement tag',
  pf_rd_r: 'Amazon placement tag',
  _encoding: 'Amazon encoding tag',
  smid: 'Amazon seller ID',
  qid: 'Amazon search session ID',

  // Adobe / Webtrekk / AT Internet
  s_kwcid: 'Adobe keyword ID',
  ef_id: 'Adobe click ID',
  wt_mc: 'Webtrekk campaign tag',
  wt_zmc: 'Webtrekk campaign tag',

  // Google search cruft
  ved: 'Google result-position tag',
  ei: 'Google search session ID',
  oq: 'Google original query',
  gs_l: 'Google search session tag',
  esrc: 'Google referral source',
  usg: 'Google link signature',

  // Generic
  ref_src: 'Referrer source',
  ref_url: 'Referrer URL',
  referrer: 'Referrer tag',
  cmpid: 'Campaign ID',
  ncid: 'Campaign ID',
  campaign_id: 'Campaign ID',
  ad_id: 'Ad ID',
  adset_id: 'Ad set ID',
  creative_id: 'Ad creative ID',
  spm: 'Alibaba tracking path',
  scm: 'Alibaba tracking code',
  trk: 'Tracking tag',
  trkCampaign: 'Tracking campaign',
  soc_src: 'Social source tag',
  soc_trk: 'Social tracking tag',
  otc: 'One-time campaign code',
  ntc: 'Newsletter tracking code',
  feature: 'Referral feature tag'
}));

/** Prefix rules: any parameter starting with these is a tracker. */
const PREFIXES = [
  ['utm_', 'Campaign tag'],
  ['pk_', 'Piwik campaign tag'],
  ['mtm_', 'Matomo campaign tag'],
  ['matomo_', 'Matomo campaign tag'],
  ['piwik_', 'Piwik campaign tag'],
  ['stm_', 'Campaign tag'],
  ['itm_', 'Internal campaign tag'],
  ['at_custom', 'AT Internet tracking tag'],
  ['hsa_', 'HubSpot ad tag'],
  ['vero_', 'Vero tracking tag'],
  ['mkt_', 'Marketing tag'],
  ['mkwid', 'Marketing widget ID'],
  ['adobe_mc', 'Adobe Marketing Cloud ID'],
  ['_bta_', 'Bronto tracking tag'],
  ['_branch_', 'Branch link tag'],
  ['nr_', 'Newsletter tracking tag']
];

/**
 * Host rules. `keep` is an allowlist: on a match, every other parameter goes.
 * `labels` name the params we strip so the UI can explain each removal.
 */
const HOST_RULES = [
  {
    match: (h) => /(^|\.)youtube\.com$/.test(h) || /(^|\.)youtube-nocookie\.com$/.test(h),
    paths: (p) => p === '/watch',
    keep: ['v'],
    labels: {
      list: 'Playlist ID',
      index: 'Position in playlist',
      start_radio: 'Autoplay radio flag',
      pp: 'Player parameters blob',
      t: 'Start timestamp',
      ab_channel: 'Channel attribution',
      si: 'Share fingerprint',
      themeRefresh: 'Player theme flag'
    }
  },
  {
    match: (h) => /(^|\.)youtu\.be$/.test(h),
    paths: () => true,
    keep: [],
    labels: {
      si: 'Share fingerprint',
      t: 'Start timestamp',
      list: 'Playlist ID',
      index: 'Position in playlist',
      feature: 'Referral feature tag'
    }
  }
];

/** Params that look generic but must survive on hosts that need them. */
const HOST_EXCEPTIONS = [
  { host: /(^|\.)google\.[a-z.]+$/, keep: ['q', 'tbm', 'hl'] },
  { host: /(^|\.)amazon\.[a-z.]+$/, keep: ['k', 'node', 'i'] },
  { host: /(^|\.)github\.com$/, keep: ['tab', 'q', 'type'] }
];

function labelFor(key) {
  if (EXACT.has(key)) return EXACT.get(key);
  const lower = key.toLowerCase();
  if (EXACT.has(lower)) return EXACT.get(lower);
  for (const [prefix, label] of PREFIXES) {
    if (lower.startsWith(prefix)) return label;
  }
  return null;
}

function isExempt(host, key) {
  for (const rule of HOST_EXCEPTIONS) {
    if (rule.host.test(host) && rule.keep.includes(key)) return true;
  }
  return false;
}

/**
 * Clean a URL.
 *
 * @param {string} input
 * @returns {object} `{ok:true, original, cleaned, removed[], kept[], changed}`
 *                   or `{ok:false, error}`
 */
function clean(input) {
  if (typeof input !== 'string') return { ok: false, error: 'Send the URL as text.' };

  const original = input.trim();
  if (!original) return { ok: false, error: 'Paste a link first.' };
  if (original.length > 4096) return { ok: false, error: 'That link is too long to process.' };

  // Accept "youtube.com/watch?v=..." with no scheme.
  let raw = original;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) raw = 'https://' + raw;

  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: 'That does not parse as a URL.' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'Only http and https links can be cleaned.' };
  }
  if (!url.hostname) return { ok: false, error: 'That URL has no host.' };

  const fullHost = url.hostname.toLowerCase();
  const host = fullHost.replace(/^www\./, '');
  const rule = HOST_RULES.find(
    (r) => (r.match(host) || r.match(fullHost)) && r.paths(url.pathname)
  );

  const removed = [];
  const kept = [];

  for (const [key, value] of url.searchParams.entries()) {
    if (rule) {
      if (rule.keep.includes(key)) kept.push({ key, value });
      else {
        removed.push({
          key,
          value,
          reason: rule.labels[key] || labelFor(key) || 'Not needed to reach the page'
        });
      }
      continue;
    }

    if (isExempt(host, key)) {
      kept.push({ key, value });
      continue;
    }

    const reason = labelFor(key);
    if (reason) removed.push({ key, value, reason });
    else kept.push({ key, value });
  }

  // Rebuild the query in its original order, minus what we dropped.
  const params = new URLSearchParams();
  for (const { key, value } of kept) params.append(key, value);
  url.search = params.toString();

  const cleaned = url.toString();
  return { ok: true, original, cleaned, removed, kept, changed: cleaned !== original };
}

module.exports = { clean, EXACT, PREFIXES, HOST_RULES };
