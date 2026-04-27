// ==UserScript==
// @name         Social Feed Monitor (Lab)
// @namespace    http://tampermonkey.net/
// @version      2.1.0
// @description  Monitors fake social feeds for keyword/location matches and stores results locally for export.
// @author       IWATQH
// @match        https://www.x.com/*
// @match        https://www.instagram.com/*
// @match        https://www.facebook.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_notification
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  'use strict';

  const LAST_UPDATED = '2026-04-27';

  const STORAGE_KEYS = {
    data: 'sfm_scraped_posts',
    keywords: 'sfm_keywords',
    locations: 'sfm_locations',
    checkInterval: 'sfm_check_interval_ms',
    enabled: 'sfm_enabled'
  };

  const DEFAULTS = {
    keywords: ['example', 'keyword'],
    locations: ['new york', 'los angeles', 'chicago'],
    checkInterval: 5000,
    maxPostsPerCheck: 50
  };

  const SELECTOR_CONFIG = {
    post: [
      '[data-testid="post"]',
      '[data-post-id]',
      '[role="article"]',
      'article',
      '[aria-label*="Post"]'
    ],
    text: [
      '[data-testid="post-text"]',
      '[data-testid="tweetText"]',
      '[data-testid="caption"]',
      '[aria-label="Post text"]',
      '[lang]',
      '.post-content'
    ],
    user: [
      '[data-testid="user-name"]',
      '[data-testid="User-Name"]',
      '[data-author]',
      'a[href^="/@"]',
      'a[href*="/profile/"]',
      '[aria-label*="profile"]'
    ],
    time: ['time[datetime]', '[data-testid="timestamp"]', '[data-time]', 'abbr[data-utime]'],
    location: ['[data-testid="location"]', '[data-location]', '[aria-label*="location"]', '.location']
  };

  const state = {
    platform: detectPlatform(),
    keywords: loadArray(STORAGE_KEYS.keywords, DEFAULTS.keywords),
    locations: loadArray(STORAGE_KEYS.locations, DEFAULTS.locations).map(normalizeToken),
    checkInterval: loadNumber(STORAGE_KEYS.checkInterval, DEFAULTS.checkInterval),
    enabled: GM_getValue(STORAGE_KEYS.enabled, true),
    instagramFetchedUrls: new Set(),
    timer: null
  };

  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes('x.com')) return 'x';
    if (host.includes('instagram.com')) return 'instagram';
    if (host.includes('facebook.com')) return 'facebook';
    return 'unknown';
  }

  function loadArray(key, fallback) {
    const value = GM_getValue(key, fallback);
    return Array.isArray(value) ? value : fallback;
  }

  function loadNumber(key, fallback) {
    const value = Number(GM_getValue(key, fallback));
    return Number.isFinite(value) && value > 0 ? value : fallback;
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
    for (const selector of SELECTOR_CONFIG.post) {
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
    return (
      element.getAttribute('datetime') ||
      element.getAttribute('data-time') ||
      element.getAttribute('title') ||
      element.innerText ||
      null
    );
  }

  function matchesTokens(text, tokens) {
    const normalized = normalizeToken(text);
    return tokens.filter((token) => token && normalized.includes(token));
  }

  function parsePost(element) {
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
    return {
      user: onInstagram ? onInstagram[1].trim() : 'unknown',
      text: quoted ? quoted[1].trim() : description.trim()
    };
  }

  async function fetchInstagramPostDetails(postUrl, fallbackLocation) {
    const response = await fetch(postUrl, { credentials: 'include' });
    if (!response.ok) return null;

    const html = await response.text();
    const documentNode = new DOMParser().parseFromString(html, 'text/html');
    const ogDescription = documentNode.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
    const locationLabel =
      documentNode.querySelector('meta[property="instapp:location:address"]')?.getAttribute('content') ||
      fallbackLocation ||
      '';
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

  async function scrapeOnce() {
    if (!state.enabled) return;

    const parsed = allPosts().map(parsePost).filter(Boolean);
    const instagramLocationMatches = await scrapeInstagramLocationPage();
    parsed.push(...instagramLocationMatches);
    const added = appendWithDedupe(parsed);

    if (added > 0) {
      console.log(`[SFM] Added ${added} post(s). Total stored: ${loadStoredPosts().length}`);
      GM_notification({
        title: 'Social Feed Monitor',
        text: `Captured ${added} new matching post(s).`,
        timeout: 2000
      });
    }
  }

  function startMonitor() {
    if (state.timer) clearInterval(state.timer);
    state.timer = setInterval(scrapeOnce, state.checkInterval);
    setTimeout(scrapeOnce, 1500);
  }

  function promptCsvList(label, current) {
    const input = window.prompt(`${label} (comma-separated):`, current.join(', '));
    if (input === null) return null;

    return input
      .split(',')
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
    const headers = [
      'id',
      'platform',
      'user',
      'text',
      'location',
      'url',
      'time',
      'capturedAt',
      'matchedKeywords',
      'matchedLocations'
    ];

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

  function registerMenu() {
    GM_registerMenuCommand('Set Keywords', () => {
      const values = promptCsvList('Keywords', state.keywords);
      if (!values) return;
      state.keywords = values;
      GM_setValue(STORAGE_KEYS.keywords, values);
      GM_notification({ title: 'Social Feed Monitor', text: `Saved ${values.length} keyword(s).` });
    });

    GM_registerMenuCommand('Set Locations', () => {
      const values = promptCsvList('Locations', state.locations);
      if (!values) return;
      state.locations = values.map(normalizeToken);
      GM_setValue(STORAGE_KEYS.locations, values);
      GM_notification({ title: 'Social Feed Monitor', text: `Saved ${values.length} location token(s).` });
    });

    GM_registerMenuCommand('Set Check Interval (ms)', () => {
      const input = window.prompt('Check interval in milliseconds:', String(state.checkInterval));
      if (input === null) return;
      const ms = Number(input);
      if (!Number.isFinite(ms) || ms < 500) {
        window.alert('Please use a value >= 500 ms.');
        return;
      }
      state.checkInterval = ms;
      GM_setValue(STORAGE_KEYS.checkInterval, ms);
      startMonitor();
      GM_notification({ title: 'Social Feed Monitor', text: `Interval updated to ${ms}ms.` });
    });

    GM_registerMenuCommand('Enable / Disable Monitor', () => {
      state.enabled = !state.enabled;
      GM_setValue(STORAGE_KEYS.enabled, state.enabled);
      GM_notification({
        title: 'Social Feed Monitor',
        text: state.enabled ? 'Monitor enabled.' : 'Monitor disabled.'
      });
    });

    GM_registerMenuCommand('Export Data (JSON)', exportJson);
    GM_registerMenuCommand('Export Data (CSV)', exportCsv);

    GM_registerMenuCommand('Clear Stored Data', () => {
      if (window.confirm('Delete all locally stored captured posts?')) {
        GM_deleteValue(STORAGE_KEYS.data);
        GM_notification({ title: 'Social Feed Monitor', text: 'Stored data cleared.' });
      }
    });

    GM_registerMenuCommand('Show Status', () => {
      const count = loadStoredPosts().length;
      window.alert(
        [
          `Platform: ${state.platform}`,
          `Enabled: ${state.enabled}`,
          `Stored posts: ${count}`,
          `Keywords: ${state.keywords.join(', ') || '(none)'}`,
          `Locations: ${state.locations.join(', ') || '(none)'}`,
          `Check interval: ${state.checkInterval}ms`,
          `Last updated: ${LAST_UPDATED}`
        ].join('\n')
      );
    });
  }

  function initialize() {
    console.log(`[SFM] Starting on ${state.platform}. Last updated ${LAST_UPDATED}.`);
    registerMenu();
    startMonitor();
  }

  initialize();
})();
