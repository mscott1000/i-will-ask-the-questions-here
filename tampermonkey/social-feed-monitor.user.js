// ==UserScript==
// @name         Social Feed Monitor (Lab)
// @namespace    http://tampermonkey.net/
// @version      2.3.0
// @description  Monitors social/search feeds for keyword/location matches and stores results locally for export.
// @author       IWATQH
// @match        https://www.x.com/*
// @match        https://www.instagram.com/*
// @match        https://www.facebook.com/*
// @match        https://www.google.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_notification
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  'use strict';

  const LAST_UPDATED = '2026-04-28';
  const HALF_HOUR_MS = 30 * 60 * 1000;
  const MIN_INTERVAL_MS = 60 * 1000;

  const STORAGE_KEYS = {
    data: 'sfm_scraped_posts',
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
    checkInterval: HALF_HOUR_MS,
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
    enabled: GM_getValue(STORAGE_KEYS.enabled, true),
    autoRotateSearch: GM_getValue(STORAGE_KEYS.autoRotateSearch, false),
    searchIndex: loadNumber(STORAGE_KEYS.searchIndex, 0),
    instagramFetchedUrls: new Set(),
    timer: null,
    ui: null
  };

  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes('x.com')) return 'x';
    if (host.includes('instagram.com')) return 'instagram';
    if (host.includes('facebook.com')) return 'facebook';
    if (host.includes('google.com')) return 'google';
    return 'unknown';
  }

  function loadArray(key, fallback) {
    const value = GM_getValue(key, fallback);
    return Array.isArray(value) ? value : fallback;
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

  function derivePostId(element) {
    const explicit =
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
      url: window.location.href,
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

  async function fetchInstagramPostDetails(postUrl, fallbackLocation) {
    const response = await fetch(postUrl, { credentials: 'include' });
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
    if (state.platform !== 'instagram') return [];
    if (!window.location.pathname.includes('/explore/locations/')) return [];

    const fallbackLocation = deriveLocationFromPathname();
    const postLinks = extractInstagramPostLinks();
    const pendingLinks = postLinks.filter((url) => !state.instagramFetchedUrls.has(url));
    if (pendingLinks.length === 0) return [];

    const found = [];
    for (const url of pendingLinks) {
      state.instagramFetchedUrls.add(url);
      try {
        const post = await fetchInstagramPostDetails(url, fallbackLocation);
        if (post) found.push(post);
      } catch (error) {
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

  function appendWithDedupe(newPosts) {
    if (!newPosts.length) return 0;

    const existing = loadStoredPosts();
    const seen = new Set(existing.map((p) => `${p.platform}:${p.id}`));
    let added = 0;

    for (const post of newPosts) {
      const key = `${post.platform}:${post.id}`;
      if (!seen.has(key)) {
        existing.push(post);
        seen.add(key);
        added += 1;
      }
    }

    if (added > 0) {
      saveStoredPosts(existing);
    }

    return added;
  }

  function buildSearchUrls() {
    const locations = state.locations.length ? state.locations : DEFAULT_LOCATIONS;
    const googleUrls = [];

    for (const location of locations.slice(0, 20)) {
      for (const pattern of GOOGLE_QUERY_PATTERNS.slice(0, 20)) {
        const query = `site:instagram.com "${location}" ${pattern}`;
        googleUrls.push(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
      }
    }

    const instagramUrls = INSTAGRAM_HASHTAGS.map((tag) => `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`);
    const facebookUrls = locations.slice(0, 30).map((location) => `https://www.facebook.com/search/posts/?q=${encodeURIComponent(`${location} trivia host`)}`);

    return [...googleUrls, ...instagramUrls, ...facebookUrls];
  }

  function maybeRotateSearchPage() {
    if (!state.autoRotateSearch) return;

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
    if (!state.enabled) return;

    const parsed = allPosts().map(parsePost).filter(Boolean);
    const instagramLocationMatches = await scrapeInstagramLocationPage();
    parsed.push(...instagramLocationMatches);
    const added = appendWithDedupe(parsed);

    if (added > 0) {
      console.log(`[SFM] Added ${added} post(s). Total stored: ${loadStoredPosts().length}`);
      GM_notification({ title: 'Social Feed Monitor', text: `Captured ${added} new matching post(s).`, timeout: 2000 });
    }

    maybeRotateSearchPage();
  }

  function startMonitor() {
    if (state.timer) clearInterval(state.timer);
    state.timer = setInterval(scrapeOnce, state.checkInterval);
    setTimeout(scrapeOnce, 1500);
    updateStatusText();
  }

  function splitListInput(input) {
    return String(input || '')
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function saveBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportJson() {
    const data = loadStoredPosts();
    const filename = `sfm-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    saveBlob(JSON.stringify(data, null, 2), filename, 'application/json');
  }

  function toCsvValue(value) {
    const safe = String(value ?? '').replace(/"/g, '""');
    return `"${safe}"`;
  }

  function exportCsv() {
    const data = loadStoredPosts();
    const headers = ['id', 'platform', 'user', 'text', 'location', 'url', 'time', 'capturedAt', 'matchedKeywords', 'matchedLocations'];
    const rows = [headers.join(',')];

    for (const item of data) {
      rows.push(
        [
          toCsvValue(item.id),
          toCsvValue(item.platform),
          toCsvValue(item.user),
          toCsvValue(item.text),
          toCsvValue(item.location),
          toCsvValue(item.url),
          toCsvValue(item.time),
          toCsvValue(item.capturedAt),
          toCsvValue((item.matchedKeywords || []).join('|')),
          toCsvValue((item.matchedLocations || []).join('|'))
        ].join(',')
      );
    }

    const filename = `sfm-export-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    saveBlob(rows.join('\n'), filename, 'text/csv;charset=utf-8');
  }

  function statusLines() {
    const count = loadStoredPosts().length;
    return [
      `Platform: ${state.platform}`,
      `Enabled: ${state.enabled ? 'Yes' : 'No'}`,
      `Stored posts: ${count}`,
      `Keywords: ${state.keywords.join(', ') || '(none)'}`,
      `Locations: ${state.locations.join(', ') || '(none)'}`,
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
      #sfm-status{white-space:pre-wrap;background:#f5f7fa;border-radius:8px;padding:8px;margin-top:10px;font-family:ui-monospace,monospace;font-size:12px}
    `;
    document.head.appendChild(style);

    const toggle = document.createElement('button');
    toggle.id = 'sfm-toggle-btn';
    toggle.textContent = 'SFM';

    const panel = document.createElement('div');
    panel.id = 'sfm-panel';
    panel.classList.add('sfm-hidden');
    panel.innerHTML = `
      <h3>Social Feed Monitor</h3>
      <div class="sfm-row"><input id="sfm-enabled" type="checkbox" /><label for="sfm-enabled" style="margin:0">Enable monitor</label></div>
      <div class="sfm-row"><input id="sfm-auto-rotate" type="checkbox" /><label for="sfm-auto-rotate" style="margin:0">Auto-rotate search pages each cycle</label></div>
      <label for="sfm-keywords">Keywords (comma or new line)</label>
      <textarea id="sfm-keywords"></textarea>
      <label for="sfm-locations">Locations (comma or new line)</label>
      <textarea id="sfm-locations"></textarea>
      <label for="sfm-interval">Automatic check interval (minutes)</label>
      <input id="sfm-interval" type="number" min="1" step="1" />
      <div class="sfm-actions">
        <button id="sfm-save" class="sfm-primary">Save settings</button>
        <button id="sfm-half-hour">Use 30 minutes</button>
        <button id="sfm-run-now">Run now</button>
        <button id="sfm-status-btn">Show status</button>
        <button id="sfm-export-json">Export JSON</button>
        <button id="sfm-export-csv">Export CSV</button>
        <button id="sfm-clear">Clear stored data</button>
      </div>
      <pre id="sfm-status"></pre>
    `;
    document.body.appendChild(toggle);
    document.body.appendChild(panel);

    const enabled = panel.querySelector('#sfm-enabled');
    const autoRotate = panel.querySelector('#sfm-auto-rotate');
    const keywords = panel.querySelector('#sfm-keywords');
    const locations = panel.querySelector('#sfm-locations');
    const interval = panel.querySelector('#sfm-interval');
    const status = panel.querySelector('#sfm-status');

    state.ui = { panel, enabled, autoRotate, keywords, locations, interval, status };

    function hydrate() {
      enabled.checked = state.enabled;
      autoRotate.checked = state.autoRotateSearch;
      keywords.value = state.keywords.join(', ');
      locations.value = state.locations.join(', ');
      interval.value = String(Math.max(1, Math.round(state.checkInterval / 60000)));
      updateStatusText();
    }

    toggle.addEventListener('click', () => {
      panel.classList.toggle('sfm-hidden');
      hydrate();
    });

    panel.querySelector('#sfm-save').addEventListener('click', () => {
      const newKeywords = splitListInput(keywords.value);
      const newLocations = splitListInput(locations.value).map(normalizeToken);
      const minutes = Number(interval.value);
      if (!Number.isFinite(minutes) || minutes < 1) {
        window.alert('Interval must be 1 minute or more.');
        return;
      }

      state.enabled = enabled.checked;
      state.autoRotateSearch = autoRotate.checked;
      state.keywords = newKeywords;
      state.locations = newLocations;
      state.checkInterval = Math.max(MIN_INTERVAL_MS, Math.round(minutes * 60000));
      GM_setValue(STORAGE_KEYS.enabled, state.enabled);
      GM_setValue(STORAGE_KEYS.autoRotateSearch, state.autoRotateSearch);
      GM_setValue(STORAGE_KEYS.keywords, newKeywords);
      GM_setValue(STORAGE_KEYS.locations, newLocations);
      GM_setValue(STORAGE_KEYS.checkInterval, state.checkInterval);
      startMonitor();
      GM_notification({ title: 'Social Feed Monitor', text: 'Settings saved.' });
      hydrate();
    });

    panel.querySelector('#sfm-half-hour').addEventListener('click', () => {
      interval.value = '30';
    });

    panel.querySelector('#sfm-run-now').addEventListener('click', async () => {
      await scrapeOnce();
      updateStatusText();
    });

    panel.querySelector('#sfm-status-btn').addEventListener('click', () => {
      window.alert(statusLines().join('\n'));
      updateStatusText();
    });
    panel.querySelector('#sfm-export-json').addEventListener('click', exportJson);
    panel.querySelector('#sfm-export-csv').addEventListener('click', exportCsv);
    panel.querySelector('#sfm-clear').addEventListener('click', () => {
      if (!window.confirm('Delete all locally stored captured posts?')) return;
      GM_deleteValue(STORAGE_KEYS.data);
      GM_notification({ title: 'Social Feed Monitor', text: 'Stored data cleared.' });
      updateStatusText();
    });

    GM_registerMenuCommand('Open Social Feed Monitor Panel', () => {
      panel.classList.remove('sfm-hidden');
      hydrate();
    });

    hydrate();
  }

  function initialize() {
    console.log(`[SFM] Starting on ${state.platform}. Last updated ${LAST_UPDATED}.`);
    createPopupUI();
    startMonitor();
  }

  initialize();
})();
