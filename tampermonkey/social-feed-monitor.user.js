// ==UserScript==
// @name         Socials Lead Generator
// @namespace    http://tampermonkey.net/
// @version      2.4.1
// @description  Monitors social/search feeds for keyword/location matches and stores results locally for export.
// @author       IWATQH
// @match        https://www.x.com/*
// @match        https://x.com/*
// @match        https://twitter.com/*
// @match        https://www.instagram.com/*
// @match        https://www.facebook.com/*
// @match        https://www.google.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_notification
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      script.google.com
// @connect      script.googleusercontent.com
// ==/UserScript==

(function () {
  'use strict';


const LOCAL_POSTS_KEY = 'sfm_scraped_posts';
const SENT_IDS_BY_DAY_KEY = 'social_post_leads_sent_entry_ids_by_day_v1';
const RUNTIME_LOG_KEY = 'sfm_runtime_events_v1';
const MAX_RUNTIME_EVENTS = 500;

const SHEETS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbyaVJ09hXROkOuorUhb1ix1_2s4cpv2tfjt4Jbu52I7PL2S4GrBKdhd_yriSpM2LWXjyA/exec';
const SHEETS_SHEET_ID = '1JKS5cHQrz-dK9Bb0hIqUQTpBQjXAnMe4J2JyGKibJSg';

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatDateGeneratedForSheet(date = new Date()) {
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const year = pad2(date.getFullYear() % 100);
  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());

  return `${month}/${day}/${year} ${hour}:${minute}`;
}

function cleanPostText(value) {
  if (value === null || value === undefined) return '';

  return String(value)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function collectMeaningfulPostText(entry) {
  const possibleTextFields = [
    entry.text,
    entry.postText,
    entry.caption,
    entry.message,
    entry.content,
    entry.description,
    entry.fullText,
    entry.meaningfulText
  ];

  if (Array.isArray(entry.textParts)) {
    possibleTextFields.push(...entry.textParts);
  }

  const seen = new Set();
  const parts = [];

  for (const value of possibleTextFields) {
    const cleaned = cleanPostText(value);

    if (!cleaned) continue;
    if (seen.has(cleaned)) continue;

    seen.add(cleaned);
    parts.push(cleaned);
  }

  return parts.join('\n\n');
}

function normalizeSiteForSheet(site, link) {
  const rawSite = String(site || '').trim().toLowerCase();
  const rawLink = String(link || '').trim().toLowerCase();
  const combined = `${rawSite} ${rawLink}`;

  if (combined.includes('instagram.com') || combined.includes('instagram')) {
    return 'Instagram';
  }

  if (combined.includes('facebook.com') || combined.includes('facebook')) {
    return 'Facebook';
  }

  if (
    combined.includes('twitter.com') ||
    combined.includes('x.com') ||
    combined === 'x' ||
    combined.includes('x/twitter')
  ) {
    return 'X/Twitter';
  }

  return '';
}

function normalizeEntryForSheet(entry, dateGenerated) {
  const link = cleanPostText(
    entry.link ||
    entry.postUrl ||
    entry.permalink ||
    entry.url ||
    entry.sourceUrl ||
    ''
  );

  const postedAt = cleanPostText(
    entry.postedAt ||
    entry.posted_at ||
    entry.timestamp ||
    entry.createdAt ||
    entry.time ||
    ''
  );

  const site = normalizeSiteForSheet(
    entry.site ||
    entry.platform ||
    entry.source ||
    '',
    link
  );

  const text = collectMeaningfulPostText(entry);

  return {
    dateGenerated,
    site,
    text,
    postedAt,
    link
  };
}

function makeEntryId(entry) {
  const normalized = normalizeEntryForSheet(entry, '');

  return [
    normalized.site,
    normalized.link,
    normalized.postedAt,
    normalized.text.slice(0, 250)
  ].join('|');
}

function getPersistentLog() {
  const log = GM_getValue(LOCAL_POSTS_KEY, []);

  if (Array.isArray(log)) return log;

  try {
    return JSON.parse(log);
  } catch (err) {
    console.error('Could not parse persistent log:', err);
    return [];
  }
}

function dateKeyLocal(date = new Date()) {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  return `${year}-${month}-${day}`;
}

function getSentIdsMap() {
  const raw = GM_getValue(SENT_IDS_BY_DAY_KEY, {});
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw;
}

function setSentIdsMap(map) {
  GM_setValue(SENT_IDS_BY_DAY_KEY, map);
}

function pruneSentIdsMap(map, keepDays = 14) {
  const keys = Object.keys(map).sort();
  if (keys.length <= keepDays) return map;
  const pruned = {};
  for (const key of keys.slice(-keepDays)) {
    pruned[key] = Array.isArray(map[key]) ? map[key] : [];
  }
  return pruned;
}

function getSentIdsForToday() {
  const map = getSentIdsMap();
  return new Set(map[dateKeyLocal()] || []);
}

function getUnsentEntries() {
  const log = getPersistentLog();
  const sentIds = getSentIdsForToday();

  return log
    .map(entry => ({
      id: makeEntryId(entry),
      entry
    }))
    .filter(item => item.id && !sentIds.has(item.id));
}

function markEntriesSent(items) {
  const map = getSentIdsMap();
  const today = dateKeyLocal();
  const sentIds = new Set(map[today] || []);

  for (const item of items) {
    sentIds.add(item.id);
  }

  map[today] = Array.from(sentIds);
  setSentIdsMap(pruneSentIdsMap(map));
}

function sendUnsentLogEntriesToSheet() {
  const unsentItems = getUnsentEntries();

  if (!unsentItems.length) {
    console.log('[Log Sender] No new entries to send.');
    return;
  }

  const dateGenerated = formatDateGeneratedForSheet(new Date());

  const payload = {
    sheetId: SHEETS_SHEET_ID,
    dateGenerated,
    entries: unsentItems.map(item => normalizeEntryForSheet(item.entry, dateGenerated))
  };

  GM_xmlhttpRequest({
    method: 'POST',
    url: SHEETS_WEBAPP_URL,
    headers: {
      'Content-Type': 'application/json'
    },
    data: JSON.stringify(payload),
    timeout: 60000,

    onload: function(response) {
      let result = null;

      try {
        result = JSON.parse(response.responseText || '{}');
      } catch (err) {
        console.error('[Log Sender] Bad response:', response.responseText);
        return;
      }

      if (response.status >= 200 && response.status < 300 && result.ok) {
        markEntriesSent(unsentItems);
        console.log(`[Log Sender] Sent ${unsentItems.length} entries.`);
      } else {
        console.error('[Log Sender] Upload failed:', response.status, result);
      }
    },

    onerror: function(err) {
      console.error('[Log Sender] Network error:', err);
    },

    ontimeout: function() {
      console.error('[Log Sender] Upload timed out.');
    }
  });
}

function isBlockedOrVerificationPage(url = window.location.href) {
  const normalized = String(url || '').toLowerCase();
  if (!normalized) return false;

  return (
    normalized.includes('instagram.com/accounts/suspended') ||
    normalized.includes('instagram.com/challenge') ||
    normalized.includes('instagram.com/accounts/login') ||
    normalized.includes('checkpoint')
  );
}

  const LAST_UPDATED = '2026-04-28';
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  const MIN_INTERVAL_MS = 60 * 1000;

  const STORAGE_KEYS = {
    data: LOCAL_POSTS_KEY,
    keywords: 'sfm_keywords',
    locations: 'sfm_locations',
    checkInterval: 'sfm_check_interval_ms',
    enabled: 'sfm_enabled',
    autoRotateSearch: 'sfm_auto_rotate_search',
    searchIndex: 'sfm_search_index'
  };

  const DEFAULT_KEYWORDS = [
    'looking for someone to host trivia', 'looking for trivia host', 'someone to host trivia', 'host trivia night',
    'trivia host', 'host trivia', 'trivia company', 'trivia night', 'weekly events', 'new weekly event',
    'tuesday night', 'wednesday night', 'karaoke and trivia', 'music bingo', 'bar events', 'restaurant events',
    'slow night', 'what events should we add', 'trivia night coming soon', 'now booking events',
    'looking for something fun on tuesdays', 'nonprofit trivia venue', 'looking for karaoke/trivia hosting',
    'event host needed', 'pub quiz host', 'quiz night host', 'themed trivia', 'team trivia',
    'happy hour trivia', 'special event host', 'emcee needed', 'game night', 'open mic', 'karaoke night',
    'new ownership', 'tuesday specials', 'wednesday specials', 'private events', 'community night', 'midweek crowd'
  ];

  const DEFAULT_LOCATIONS = [
    'st. louis', 'st louis', 'stl', 'south city', 'soulard', 'dogtown', 'the grove', 'tower grove', 'maplewood',
    'webster groves', 'kirkwood', 'clayton', 'central west end', 'metro east', 'st. charles', 'florissant',
    'south county', 'north county', 'chesterfield', 'creve coeur', 'ladue', 'university city', 'u city', 'downtown stl',
    'cwe', 'shaw', 'benton park', 'lafayette square', 'richmond heights', 'brentwood', 'rock hill', 'sunset hills',
    'ballwin', 'wildwood', 'maryland heights'
  ];

  const GOOGLE_QUERY_PATTERNS = [
    '"looking for someone to host trivia"', '"looking for trivia host"', '"someone to host trivia"', '"host trivia night"',
    '"trivia company"', '"karaoke and trivia" "tuesday"', '"weekly events" "bar"', '"new weekly event" "restaurant"',
    '"tuesday night" "bar" "trivia"', '"wednesday night" "bar" "trivia"', '"music bingo"', '"karaoke night" "tuesday"',
    '"game night" bar', '"new ownership" bar', '"tuesday specials" bar', '"wednesday specials" bar',
    '"bar events"', '"restaurant events"', '"slow night" restaurant OR bar', '"now booking events"',
    '"what events should we add"', '"trivia night coming soon"', '"looking for karaoke/trivia hosting"', '"nonprofit trivia venue"',
    '"pub quiz host"', '"team trivia"', '"themed trivia"', '"weekly entertainment"',
    '"open mic" "weekly event"', '"midweek event ideas"'
  ];

  const INSTAGRAM_HASHTAGS = [
    'stltrivia', 'stlouistrivia', 'trivianightstl', 'stlouisbar', 'stlbars', 'stlrestaurants', 'stlnightlife',
    'stlevents', 'southcitystl', 'soulard', 'thegrovestl', 'towergrove', 'maplewoodmo', 'dogtownstl', 'centralwestend',
    'stlhappyhour', 'stlfoodscene', 'stlbarlife', 'stlcommunity', 'stlbusiness', 'stlentertainment', 'stllocal',
    'stcharlesmo', 'metroeast', 'stlouissmallbusiness', 'stlweekend', 'stlmidweek', 'stlpub', 'stlrestaurantscene',
    'stlnightout', 'stlbeverages', 'stlvenue'
  ];

  const DEFAULTS = {
    keywords: DEFAULT_KEYWORDS,
    locations: DEFAULT_LOCATIONS,
    checkInterval: TWO_HOURS_MS,
    maxPostsPerCheck: 50
  };

  const SELECTOR_CONFIG = {
    post: ['[data-testid="post"]', '[data-post-id]', '[role="article"]', 'article', '[aria-label*="Post"]'],
    text: ['[data-testid="post-text"]', '[data-testid="tweetText"]', '[data-testid="caption"]', '[aria-label="Post text"]', '[lang]', '.post-content'],
    user: ['[data-testid="user-name"]', '[data-testid="User-Name"]', '[data-author]', 'a[href^="/@"]', 'a[href*="/profile/"]', '[aria-label*="profile"]'],
    time: ['time[datetime]', '[data-testid="timestamp"]', '[data-time]', 'abbr[data-utime]'],
    location: ['[data-testid="location"]', '[data-location]', '[aria-label*="location"]', '.location'],
    googleResult: ['div#search .g', 'div[data-sokoban-container]', 'div.MjjYud'],
    googleTitle: ['h3'],
    googleSnippet: ['div.VwiC3b', 'span.aCOpRe', '.IsZvec']
  };

  const state = {
    platform: detectPlatform(),
    keywords: loadArray(STORAGE_KEYS.keywords, DEFAULTS.keywords),
    locations: loadArray(STORAGE_KEYS.locations, DEFAULTS.locations).map(normalizeToken),
    checkInterval: loadNumber(STORAGE_KEYS.checkInterval, DEFAULTS.checkInterval),
    enabled: loadBoolean(STORAGE_KEYS.enabled, true),
    autoRotateSearch: loadBoolean(STORAGE_KEYS.autoRotateSearch, true),
    searchIndex: loadNumber(STORAGE_KEYS.searchIndex, 0),
    instagramFetchedUrls: new Set(),
    timer: null,
    ui: null,
    hardStopped: false,
    activeFetchController: null
  };

  function readRuntimeLog() {
    const log = GM_getValue(RUNTIME_LOG_KEY, []);
    return Array.isArray(log) ? log : [];
  }

  function writeRuntimeLog(log) {
    GM_setValue(RUNTIME_LOG_KEY, log.slice(-MAX_RUNTIME_EVENTS));
  }

  function logRuntimeEvent(action, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      platform: state.platform,
      action,
      details
    };
    const log = readRuntimeLog();
    log.push(entry);
    writeRuntimeLog(log);
    return entry;
  }

  function detectPlatform() {
  const host = window.location.hostname.toLowerCase();

  if (host === 'x.com' || host === 'www.x.com' || host.includes('twitter.com')) return 'x';
  if (host.includes('instagram.com')) return 'instagram';
  if (host.includes('facebook.com')) return 'facebook';
  if (host.includes('google.com')) return 'google';

  return 'unknown';
}

  function loadArray(key, fallback) {
    const value = GM_getValue(key, fallback);
    return Array.isArray(value) ? value : fallback;
  }

  function loadBoolean(key, fallback) {
    const value = GM_getValue(key, fallback);
    return typeof value === 'boolean' ? value : fallback;
  }

  function loadNumber(key, fallback) {
    const value = Number(GM_getValue(key, fallback));
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  }

  function normalizeToken(value) {
    return String(value || '').trim().toLowerCase();
  }

  function firstMatch(root, selectors) {
    for (const selector of selectors) {
      const element = root.querySelector(selector);
      if (element) return element;
    }
    return null;
  }

  function textFrom(root, selectors) {
    const element = firstMatch(root, selectors);
    return element ? element.innerText.trim() : '';
  }

  function attrFrom(root, selectors, attr) {
    const element = firstMatch(root, selectors);
    return element ? element.getAttribute(attr) : null;
  }

  function allPosts() {
    const combined = [];
    const postSelectors = state.platform === 'google' ? SELECTOR_CONFIG.googleResult : SELECTOR_CONFIG.post;
    for (const selector of postSelectors) {
      combined.push(...Array.from(document.querySelectorAll(selector)));
    }
    return Array.from(new Set(combined)).slice(0, DEFAULTS.maxPostsPerCheck);
  }

  function cleanUrlForStorage(href) {
  if (!href) return '';

  try {
    const url = new URL(href, window.location.origin);
    url.hash = '';

    [
      'fbclid',
      'igsh',
      'igshid',
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content'
    ].forEach(param => url.searchParams.delete(param));

    return url.href;
  } catch (err) {
    return String(href || '').trim();
  }
}

function derivePostUrl(element) {
  const selectors = [
    'a[href*="/status/"]',
    'a[href*="/posts/"]',
    'a[href*="/permalink.php"]',
    'a[href*="story_fbid="]',
    'a[href*="/photos/"]',
    'a[href*="/videos/"]',
    'a[href*="/reel/"]',
    'a[href*="/p/"]'
  ];

  for (const selector of selectors) {
    const link = element.querySelector(selector);
    const href = link?.getAttribute('href');

    if (href) {
      return cleanUrlForStorage(href);
    }
  }

  return '';
}

function derivePostId(element) {
  const postUrl = derivePostUrl(element);

  const explicit =
    postUrl ||
    element.getAttribute('data-post-id') ||
    element.getAttribute('data-testid') ||
    attrFrom(element, ['a[href*="/status/"]', 'a[href*="/posts/"]'], 'href');

  if (explicit) return String(explicit).trim();

  const hashSource = `${element.innerText || ''}|${window.location.pathname}`;
  let hash = 0;

  for (let i = 0; i < hashSource.length; i += 1) {
    hash = (hash << 5) - hash + hashSource.charCodeAt(i);
    hash |= 0;
  }

  return `derived-${Math.abs(hash)}`;
}

  
function attemptGoogleRobotCheck() {
  if (state.platform !== 'google') return false;
  const frames = Array.from(document.querySelectorAll('iframe[src*="recaptcha"], iframe[title*="recaptcha" i], iframe[title*="not a robot" i]'));
  for (const frame of frames) {
    try {
      const doc = frame.contentDocument || frame.contentWindow?.document;
      if (!doc) continue;
      const checkbox =
        doc.querySelector('#recaptcha-anchor') ||
        doc.querySelector('div[role="checkbox"][aria-label*="robot" i]') ||
        doc.querySelector('span[role="checkbox"][aria-label*="robot" i]');
      if (checkbox) {
        checkbox.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        logRuntimeEvent('google_robot_check_clicked', { frameTitle: frame.title || null });
        return true;
      }
    } catch (error) {
      logRuntimeEvent('google_robot_check_inaccessible_frame', { message: String(error) });
    }
  }
  return false;
}

  function parseTime(element) {
    if (!element) return null;
    return element.getAttribute('datetime') || element.getAttribute('data-time') || element.getAttribute('title') || element.innerText || null;
  }

  function matchesTokens(text, tokens) {
    const normalized = normalizeToken(text);
    return tokens.filter((token) => token && normalized.includes(token));
  }

  function parseGoogleResult(element) {
    const title = textFrom(element, SELECTOR_CONFIG.googleTitle);
    const snippet = textFrom(element, SELECTOR_CONFIG.googleSnippet);
    const link = element.querySelector('a[href]')?.href || window.location.href;
    const text = `${title} ${snippet}`.trim();
    if (!text) return null;

    const matchedKeywords = matchesTokens(text, state.keywords.map(normalizeToken));
    const matchedLocations = matchesTokens(text, state.locations);
    if (matchedKeywords.length === 0 || matchedLocations.length === 0) return null;

    return {
      id: `${link}|${title}`.slice(0, 240),
      platform: state.platform,
      user: 'google-result',
      text,
      location: null,
      url: link,
      time: null,
      capturedAt: new Date().toISOString(),
      matchedKeywords,
      matchedLocations
    };
  }

  function parsePost(element) {
  if (state.platform === 'google') return parseGoogleResult(element);

  const text = textFrom(element, SELECTOR_CONFIG.text);
  const user = textFrom(element, SELECTOR_CONFIG.user) || attrFrom(element, SELECTOR_CONFIG.user, 'data-author') || 'unknown';
  const location = textFrom(element, SELECTOR_CONFIG.location);
  const postTime = parseTime(firstMatch(element, SELECTOR_CONFIG.time));
  const postUrl = derivePostUrl(element) || window.location.href;
  const id = derivePostId(element);

  if (!text) return null;

  const matchedKeywords = matchesTokens(text, state.keywords.map(normalizeToken));
  const matchedLocations = matchesTokens(`${location} ${text}`, state.locations);

  if (matchedKeywords.length === 0 || matchedLocations.length === 0) {
    return null;
  }

  return {
    id,
    platform: state.platform,
    user,
    text,
    location: location || null,
    url: postUrl,
    time: postTime,
    capturedAt: new Date().toISOString(),
    matchedKeywords,
    matchedLocations
  };
}

  function deriveLocationFromPathname() {
    const match = window.location.pathname.match(/\/explore\/locations\/\d+\/([^/]+)\//i);
    if (!match) return '';
    return decodeURIComponent(match[1]).replace(/-/g, ' ');
  }

  function normalizeInstagramPostUrl(href) {
    if (!href) return null;
    try {
      const absolute = new URL(href, window.location.origin);
      if (!/^\/(p|reel)\//.test(absolute.pathname)) return null;
      return `${window.location.origin}${absolute.pathname}`;
    } catch (error) {
      return null;
    }
  }

  function extractInstagramPostLinks() {
    const links = Array.from(document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]'));
    const normalized = links.map((link) => normalizeInstagramPostUrl(link.getAttribute('href'))).filter(Boolean);
    return Array.from(new Set(normalized)).slice(0, DEFAULTS.maxPostsPerCheck);
  }

  function parseInstagramMetaDescription(description) {
    if (!description) return { user: 'unknown', text: '' };
    const onInstagram = description.match(/^([^:]+?)\s+on Instagram:/i);
    const quoted = description.match(/[“"]([\s\S]*?)[”"]/);
    return { user: onInstagram ? onInstagram[1].trim() : 'unknown', text: quoted ? quoted[1].trim() : description.trim() };
  }

  async function fetchInstagramPostDetails(postUrl, fallbackLocation, signal) {
    const response = await fetch(postUrl, { credentials: 'include', signal });
    if (!response.ok) return null;

    const html = await response.text();
    const documentNode = new DOMParser().parseFromString(html, 'text/html');
    const ogDescription = documentNode.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
    const locationLabel = documentNode.querySelector('meta[property="instapp:location:address"]')?.getAttribute('content') || fallbackLocation || '';
    const publishedAt = documentNode.querySelector('time')?.getAttribute('datetime') || null;
    const parsed = parseInstagramMetaDescription(ogDescription);

    if (!parsed.text) return null;

    const matchedKeywords = matchesTokens(parsed.text, state.keywords.map(normalizeToken));
    const matchedLocations = matchesTokens(`${locationLabel} ${parsed.text}`, state.locations);
    if (matchedKeywords.length === 0 || matchedLocations.length === 0) return null;

    return {
      id: postUrl,
      platform: state.platform,
      user: parsed.user,
      text: parsed.text,
      location: locationLabel || null,
      url: postUrl,
      time: publishedAt,
      capturedAt: new Date().toISOString(),
      matchedKeywords,
      matchedLocations
    };
  }

  async function scrapeInstagramLocationPage() {
    if (state.hardStopped || state.platform !== 'instagram') return [];
    if (!window.location.pathname.includes('/explore/locations/')) return [];

    const fallbackLocation = deriveLocationFromPathname();
    const postLinks = extractInstagramPostLinks();
    const pendingLinks = postLinks.filter((url) => !state.instagramFetchedUrls.has(url));
    if (pendingLinks.length === 0) return [];

    const found = [];
    for (const url of pendingLinks) {
      if (state.hardStopped) break;
      state.instagramFetchedUrls.add(url);
      try {
        const post = await fetchInstagramPostDetails(url, fallbackLocation, state.activeFetchController?.signal);
        if (post) found.push(post);
      } catch (error) {
        if (error?.name === 'AbortError') return found;
        console.debug('[SFM] Unable to fetch Instagram post details:', url, error);
      }
    }
    return found;
  }

  function loadStoredPosts() {
    const posts = GM_getValue(STORAGE_KEYS.data, []);
    return Array.isArray(posts) ? posts : [];
  }

  function saveStoredPosts(posts) {
    GM_setValue(STORAGE_KEYS.data, posts);
  }

  function canonicalPostKey(post) {
  const normalized = normalizeEntryForSheet(post, '');
  const site = normalized.site || post.platform || '';
  const link = cleanPostText(normalized.link).replace(/\/$/, '').toLowerCase();

  if (link) {
    return `${site}|${link}`;
  }

  return [
    site,
    post.id || '',
    normalized.postedAt || '',
    normalized.text.slice(0, 250)
  ].join('|').toLowerCase();
}

function appendWithDedupe(newPosts) {
  if (!newPosts.length) return 0;

  const existing = loadStoredPosts();
  const seen = new Set(existing.map(canonicalPostKey));
  let added = 0;

  for (const post of newPosts) {
    const key = canonicalPostKey(post);

    if (!key || seen.has(key)) continue;

    existing.push(post);
    seen.add(key);
    added += 1;
  }

  if (added > 0) {
    saveStoredPosts(existing);
  }

  return added;
}


function locationsCongruent(post) {
  if (!state.locations.length) return true;

  const associatedLocation = normalizeToken(post.location || '');

  if (!associatedLocation) return true;

  return state.locations.some((loc) => associatedLocation.includes(loc) || loc.includes(associatedLocation));
}

function filterIncongruentLocations(posts) {
  if (!posts.length) return { kept: posts, dropped: 0 };

  const kept = [];
  let dropped = 0;

  for (const post of posts) {
    if (locationsCongruent(post)) {
      kept.push(post);
    } else {
      dropped += 1;
    }
  }

  return { kept, dropped };
}

  function stripQuotes(value) {
  return String(value || '').replace(/"/g, '').trim();
}

  function buildSearchUrls() {
  const areas = state.locations.length ? state.locations : DEFAULT_LOCATIONS;
  const terms = state.keywords.length ? state.keywords : DEFAULT_KEYWORDS;
  const googleUrls = [];

  const areaSlice = areas.slice(0, 20);
  const termSlice = terms.slice(0, 20);

  for (const area of areaSlice) {
    for (const term of termSlice) {
      const query = `"${area}" "${term}"`;
      googleUrls.push(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
    }
  }

  for (const pattern of GOOGLE_QUERY_PATTERNS) {
    for (const area of areaSlice.slice(0, 10)) {
      const query = `${pattern} "${area}"`;
      googleUrls.push(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
    }
  }

  return Array.from(new Set(googleUrls));
}

  function shouldSkipDuplicateSheetLog({ parsedCount, keptCount, added }) {
    if (added > 0) return false;
    if (parsedCount > 0 || keptCount > 0) return false;
    if (!isBlockedOrVerificationPage(window.location.href)) return false;

    return true;
  }

  function maybeRotateSearchPage() {
    if (state.hardStopped || !state.autoRotateSearch) return;

    const urls = buildSearchUrls();
    if (urls.length === 0) return;

    const index = Number.isFinite(state.searchIndex) ? state.searchIndex : 0;
    const nextUrl = urls[index % urls.length];
    state.searchIndex = (index + 1) % urls.length;
    GM_setValue(STORAGE_KEYS.searchIndex, state.searchIndex);

    if (window.location.href !== nextUrl) {
      window.location.assign(nextUrl);
    }
  }

  async function scrapeOnce() {
  if (!state.enabled || state.hardStopped) return;
  logRuntimeEvent('scrape_started', {
    url: window.location.href,
    storedPostsBefore: loadStoredPosts().length
  });

  state.activeFetchController = new AbortController();

  try {
    attemptGoogleRobotCheck();

    const parsed = allPosts().map(parsePost).filter(Boolean);
    const instagramLocationMatches = await scrapeInstagramLocationPage();

    parsed.push(...instagramLocationMatches);

    if (state.hardStopped) return;

    const { kept: congruentPosts, dropped } = filterIncongruentLocations(parsed);

    if (dropped > 0) {
      console.log(`[SFM] Dropped ${dropped} post(s) due to incongruent associated locations.`);
      logRuntimeEvent('posts_dropped_for_location', { dropped });
    }

    const added = appendWithDedupe(congruentPosts);

    if (added > 0) {
      console.log(`[SFM] Added ${added} post(s). Total stored: ${loadStoredPosts().length}`);
      logRuntimeEvent('posts_added', { added, totalStored: loadStoredPosts().length });
      GM_notification({
        title: 'Social Feed Monitor',
        text: `Captured ${added} new matching post(s).`,
        timeout: 2000
      });
    } else {
      logRuntimeEvent('no_new_posts', { parsedCount: parsed.length, keptCount: congruentPosts.length });
    }

    if (shouldSkipDuplicateSheetLog({ parsedCount: parsed.length, keptCount: congruentPosts.length, added })) {
      logRuntimeEvent('duplicate_log_skipped', {
        reason: 'blocked_or_verification_page',
        url: window.location.href
      });
      console.log('[SFM] Duplicate log skipped due to blocked/verification page.');
    } else {
      sendUnsentLogEntriesToSheet();
      logRuntimeEvent('log_upload_attempted');
    }

    maybeRotateSearchPage();
    logRuntimeEvent('scrape_finished', { nextSearchIndex: state.searchIndex });

  } finally {
    state.activeFetchController = null;
  }
}

  function startMonitor() {
    if (state.hardStopped) return;
    if (state.timer) clearInterval(state.timer);
    state.timer = setInterval(scrapeOnce, state.checkInterval);
    setTimeout(scrapeOnce, 1500);
    logRuntimeEvent('monitor_started', { checkIntervalMs: state.checkInterval });
    updateStatusText();
  }

  function hardStopMonitor() {
    state.hardStopped = true;
    state.enabled = false;
    GM_setValue(STORAGE_KEYS.enabled, false);
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
    if (state.activeFetchController) {
      state.activeFetchController.abort();
      state.activeFetchController = null;
    }
    logRuntimeEvent('hard_stop_activated');
    GM_notification({ title: 'Social Feed Monitor', text: 'Emergency stop activated. All monitor tasks halted.' });
    updateStatusText();
  }

  function splitListInput(input) {
    return String(input || '')
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function statusLines() {
    const count = loadStoredPosts().length;
    return [
      `Platform: ${state.platform}`,
      `Enabled: ${state.enabled ? 'Yes' : 'No'}`,
      `Hard stopped: ${state.hardStopped ? 'Yes' : 'No'}`,
      `Stored posts: ${count}`,
      `Search terms: ${state.keywords.join(', ') || '(none)'}`,
      `Areas: ${state.locations.join(', ') || '(none)'}`,
      `Check interval: ${Math.round(state.checkInterval / 60000)} minute(s)`,
      `Auto-rotate search pages: ${state.autoRotateSearch ? 'On' : 'Off'}`,
      `Last updated: ${LAST_UPDATED}`
    ];
  }

  function updateStatusText() {
    if (!state.ui?.status) return;
    state.ui.status.textContent = statusLines().join('\n');
  }

  function createPopupUI() {
    const style = document.createElement('style');
    style.textContent = `
      #sfm-toggle-btn{position:fixed;right:16px;bottom:16px;z-index:2147483646;background:#0a66c2;color:#fff;border:none;border-radius:999px;padding:10px 14px;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.3)}
      #sfm-panel{position:fixed;right:16px;bottom:64px;z-index:2147483646;width:340px;max-height:80vh;overflow:auto;background:#fff;color:#111;border:1px solid #ddd;border-radius:12px;padding:12px;box-shadow:0 10px 30px rgba(0,0,0,.25);font:13px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif}
      #sfm-panel.sfm-hidden{display:none}
      #sfm-panel h3{margin:0 0 8px;font-size:15px}
      #sfm-panel label{display:block;margin:8px 0 4px;font-weight:600}
      #sfm-panel textarea,#sfm-panel input[type="number"]{width:100%;box-sizing:border-box;padding:8px;border:1px solid #bbb;border-radius:8px}
      #sfm-panel textarea{min-height:62px;resize:vertical}
      #sfm-panel .sfm-row{display:flex;gap:8px;align-items:center}
      #sfm-panel .sfm-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
      #sfm-panel button{border:1px solid #ccc;border-radius:8px;background:#f7f7f7;padding:8px;cursor:pointer}
      #sfm-panel button.sfm-primary{background:#0a66c2;color:#fff;border-color:#0a66c2}
      #sfm-panel button.sfm-danger{background:#b91c1c;color:#fff;border-color:#b91c1c}
      #sfm-status{white-space:pre-wrap;background:#f5f7fa;border-radius:8px;padding:8px;margin-top:10px;font-family:ui-monospace,monospace;font-size:12px}
    `;
    document.head.appendChild(style);

    const toggle = document.createElement('button');
    toggle.id = 'sfm-toggle-btn';
    toggle.textContent = 'SFM';

    const panel = document.createElement('div');
    panel.id = 'sfm-panel';
    panel.innerHTML = `
      <h3>Social Feed Monitor</h3>
      <label for="sfm-keywords">Search terms list (comma or new line)</label>
      <textarea id="sfm-keywords"></textarea>
      <label for="sfm-locations">Areas list (comma or new line)</label>
      <textarea id="sfm-locations"></textarea>
      <label for="sfm-interval">Automatic check interval (minutes)</label>
      <input id="sfm-interval" type="number" min="1" step="1" />
      <div class="sfm-actions">
        <button id="sfm-start" class="sfm-primary">Begin search run</button>
        <button id="sfm-debug">Debug</button>
        <button id="sfm-clear">Clear stored data</button>
        <button id="sfm-stop" class="sfm-danger">HARD STOP</button>
      </div>
      <pre id="sfm-status"></pre>
    `;
    document.body.appendChild(toggle);
    document.body.appendChild(panel);

    const keywords = panel.querySelector('#sfm-keywords');
    const locations = panel.querySelector('#sfm-locations');
    const interval = panel.querySelector('#sfm-interval');
    const status = panel.querySelector('#sfm-status');

    state.ui = { panel, keywords, locations, interval, status };

    function hydrate({ preserveInputs = true } = {}) {
      if (!preserveInputs) {
        keywords.value = state.keywords.join(', ');
        locations.value = state.locations.join(', ');
        interval.value = String(Math.max(1, Math.round(state.checkInterval / 60000)));
      }
      const controls = [keywords, locations, interval];
      controls.forEach((el) => {
        el.disabled = state.hardStopped;
      });
      updateStatusText();
    }

    toggle.addEventListener('click', () => {
      panel.classList.toggle('sfm-hidden');
      if (!panel.classList.contains('sfm-hidden')) {
        hydrate({ preserveInputs: false });
      }
    });

    panel.querySelector('#sfm-start').addEventListener('click', () => {
      if (state.hardStopped) return;
      const newKeywords = splitListInput(keywords.value);
      const newLocations = splitListInput(locations.value).map(normalizeToken);
      const minutes = Number(interval.value);
      if (!Number.isFinite(minutes) || minutes < 1) {
        window.alert('Interval must be 1 minute or more.');
        return;
      }

      state.keywords = newKeywords;
      state.locations = newLocations;
      state.checkInterval = Math.max(MIN_INTERVAL_MS, Math.round(minutes * 60000));
      GM_setValue(STORAGE_KEYS.enabled, true);
      GM_setValue(STORAGE_KEYS.autoRotateSearch, true);
      GM_setValue(STORAGE_KEYS.keywords, newKeywords);
      GM_setValue(STORAGE_KEYS.locations, newLocations);
      GM_setValue(STORAGE_KEYS.checkInterval, state.checkInterval);
      logRuntimeEvent('settings_updated', {
        keywordsCount: newKeywords.length,
        locationsCount: newLocations.length,
        checkIntervalMs: state.checkInterval
      });
      startMonitor();
      GM_notification({ title: 'Social Feed Monitor', text: `Search run started. Checking every ${Math.round(state.checkInterval / 60000)} minute(s).` });
      hydrate({ preserveInputs: false });
    });

    panel.querySelector('#sfm-debug').addEventListener('click', () => {
      const runtimeLog = readRuntimeLog();
      const summary = {
        platform: state.platform,
        hardStopped: state.hardStopped,
        enabled: state.enabled,
        checkIntervalMinutes: Math.round(state.checkInterval / 60000),
        keywords: state.keywords,
        locations: state.locations,
        storedPosts: loadStoredPosts().length,
        runtimeEventsLogged: runtimeLog.length,
        lastRuntimeEvents: runtimeLog.slice(-20)
      };

      const debugText = [
        '[SFM Debug Snapshot]',
        `Timestamp: ${new Date().toISOString()}`,
        `URL: ${window.location.href}`,
        `Platform: ${summary.platform}`,
        `Enabled: ${summary.enabled}`,
        `Hard stopped: ${summary.hardStopped}`,
        `Interval (min): ${summary.checkIntervalMinutes}`,
        `Keywords count: ${summary.keywords.length}`,
        `Locations count: ${summary.locations.length}`,
        `Stored posts: ${summary.storedPosts}`,
        `Runtime events logged: ${summary.runtimeEventsLogged}`,
        '',
        '[Recent Runtime Events]',
        ...summary.lastRuntimeEvents.map((entry) => `${entry.timestamp} | ${entry.action} | ${JSON.stringify(entry.details)}`)
      ].join('\n');

      console.log(debugText);
      navigator.clipboard?.writeText(debugText).catch(() => {});
      GM_notification({ title: 'Social Feed Monitor', text: `Debug snapshot logged (${summary.lastRuntimeEvents.length} events). Copied to clipboard when allowed.` });
      updateStatusText();
    });

    panel.querySelector('#sfm-clear').addEventListener('click', () => {
      if (!window.confirm('Delete all locally stored captured posts?')) return;
      GM_deleteValue(STORAGE_KEYS.data);
      GM_deleteValue(RUNTIME_LOG_KEY);
      GM_deleteValue(SENT_IDS_BY_DAY_KEY);
      GM_notification({ title: 'Social Feed Monitor', text: 'Stored data cleared.' });
      updateStatusText();
    });
    panel.querySelector('#sfm-stop').addEventListener('click', () => {
      if (!window.confirm('Hard stop now? This immediately halts all monitor activity until the page is reloaded.')) return;
      hardStopMonitor();
      hydrate({ preserveInputs: false });
    });

    GM_registerMenuCommand('Open Social Feed Monitor Panel', () => {
      panel.classList.remove('sfm-hidden');
      hydrate({ preserveInputs: false });
    });

    hydrate({ preserveInputs: false });
  }

  function initialize() {
    console.log(`[SFM] Starting on ${state.platform}. Last updated ${LAST_UPDATED}.`);
    logRuntimeEvent('script_initialized', { versionDate: LAST_UPDATED });
    createPopupUI();
    if (state.enabled && !state.hardStopped) {
      startMonitor();
    } else {
      updateStatusText();
    }
  }

  initialize();
})();
