// Destinations for Detection → "Upload detections (share link)". Each
// provider turns the paste body into one request and reads the share link
// from the response; the link must start with the provider's own prefix
// before the popup copies or opens it. Chosen in Settings → Detection →
// Share uploads (settings.share). Keys and tokens stay in local settings and
// are never logged or exported.

const ShareProviders = {};

ShareProviders.TITLE = 'Scrapfly detections';
ShareProviders.FILE_NAME = 'scrapfly-detections.json';

ShareProviders.DEFAULTS = Object.freeze({
  provider: 'dpaste_com',
  dpasteComDays: 30,
  dpasteOrgExpires: '2592000',
  pastebinKey: '',
  pastebinExpire: '1M',
  githubToken: '',
  customUrl: '',
  customMethod: 'POST',
  customBodyFormat: 'form',
  customFieldName: 'content',
  customJsonTemplate: '{"content": <CONTENT_JSON>, "title": <TITLE_JSON>, "expiry_days": <EXPIRY_DAYS>}',
  customHeaders: '',
  customLinkFrom: 'body',
  customLinkJsonPath: 'url',
  customExpiryDays: 30
});

// dpaste.org accepts exactly these lifetimes (seconds, or the two keywords)
ShareProviders.DPASTE_ORG_EXPIRES = ['3600', '86400', '604800', '2592000', 'never', 'onetime'];
// Pastebin's api_paste_expire_date values
ShareProviders.PASTEBIN_EXPIRE = ['10M', '1H', '1D', '1W', '2W', '1M', '6M', '1Y', 'N'];
ShareProviders.CUSTOM_METHODS = ['POST', 'PUT'];
ShareProviders.CUSTOM_BODY_FORMATS = ['form', 'json', 'raw'];
ShareProviders.CUSTOM_LINK_FROM = ['body', 'json', 'location'];

ShareProviders.clampInt = function(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
};

// Settings as stored, completed with defaults and clamped to valid values
ShareProviders.normalize = function(raw) {
  const s = { ...ShareProviders.DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
  const D = ShareProviders.DEFAULTS;
  if (!ShareProviders.PROVIDERS[s.provider]) s.provider = D.provider;
  s.dpasteComDays = ShareProviders.clampInt(s.dpasteComDays, 1, 365, D.dpasteComDays);
  if (!ShareProviders.DPASTE_ORG_EXPIRES.includes(String(s.dpasteOrgExpires))) s.dpasteOrgExpires = D.dpasteOrgExpires;
  s.dpasteOrgExpires = String(s.dpasteOrgExpires);
  if (!ShareProviders.PASTEBIN_EXPIRE.includes(s.pastebinExpire)) s.pastebinExpire = D.pastebinExpire;
  s.pastebinKey = String(s.pastebinKey || '').trim();
  s.githubToken = String(s.githubToken || '').trim();
  s.customUrl = String(s.customUrl || '').trim();
  s.customMethod = String(s.customMethod || '').toUpperCase();
  if (!ShareProviders.CUSTOM_METHODS.includes(s.customMethod)) s.customMethod = D.customMethod;
  if (!ShareProviders.CUSTOM_BODY_FORMATS.includes(s.customBodyFormat)) s.customBodyFormat = D.customBodyFormat;
  s.customFieldName = String(s.customFieldName || '').trim() || D.customFieldName;
  s.customJsonTemplate = String(s.customJsonTemplate || '') || D.customJsonTemplate;
  s.customHeaders = String(s.customHeaders || '');
  if (!ShareProviders.CUSTOM_LINK_FROM.includes(s.customLinkFrom)) s.customLinkFrom = D.customLinkFrom;
  s.customLinkJsonPath = String(s.customLinkJsonPath || '').trim() || D.customLinkJsonPath;
  s.customExpiryDays = ShareProviders.clampInt(s.customExpiryDays, 1, 3650, D.customExpiryDays);
  return s;
};

// "Name: value" per line → [[name, value]]; lines without a colon are ignored
ShareProviders.parseHeaderLines = function(text) {
  const headers = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const at = line.indexOf(':');
    if (at <= 0) continue;
    const name = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim();
    if (/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(name)) headers.push([name, value]);
  }
  return headers;
};

// The body text a service answers with, sometimes quoted or followed by a newline
ShareProviders.linkFromText = function(text) {
  const raw = String(text || '').trim().replace(/^["']|["']$/g, '').trim();
  return /^https?:\/\//i.test(raw) ? raw : '';
};

ShareProviders.readJsonPath = function(object, dottedPath) {
  return String(dottedPath || '').split('.').filter(Boolean)
    .reduce((value, key) => (value && typeof value === 'object' ? value[key] : undefined), object);
};

const formBody = (fields) => {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) body.set(key, String(value));
  return body.toString();
};
const FORM = 'application/x-www-form-urlencoded';

ShareProviders.PROVIDERS = {
  dpaste_com: {
    name: 'dpaste.com',
    linkPrefix: 'https://dpaste.com/',
    request: (content, s) => ({
      url: 'https://dpaste.com/api/v2/',
      method: 'POST',
      headers: { 'Content-Type': FORM },
      body: formBody({ content, syntax: 'json', title: ShareProviders.TITLE, expiry_days: s.dpasteComDays })
    }),
    link: (text, response) => ShareProviders.linkFromText(text) || response.location,
    expiry: (s) => ({ kind: 'days', days: s.dpasteComDays })
  },
  dpaste_org: {
    name: 'dpaste.org',
    linkPrefix: 'https://dpaste.org/',
    request: (content, s) => ({
      url: 'https://dpaste.org/api/',
      method: 'POST',
      headers: { 'Content-Type': FORM },
      body: formBody({ content, lexer: 'json', format: 'url', expires: s.dpasteOrgExpires })
    }),
    link: (text) => ShareProviders.linkFromText(text),
    expiry: (s) => s.dpasteOrgExpires === 'never' ? { kind: 'never' }
      : s.dpasteOrgExpires === 'onetime' ? { kind: 'onetime' }
        : { kind: 'seconds', seconds: Number(s.dpasteOrgExpires) }
  },
  paste_rs: {
    name: 'paste.rs',
    linkPrefix: 'https://paste.rs/',
    request: (content) => ({
      url: 'https://paste.rs/',
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: content
    }),
    link: (text) => ShareProviders.linkFromText(text),
    expiry: () => ({ kind: 'service' })
  },
  pastebin: {
    name: 'Pastebin',
    linkPrefix: 'https://pastebin.com/',
    needs: 'pastebinKey',
    request: (content, s) => ({
      url: 'https://pastebin.com/api/api_post.php',
      method: 'POST',
      headers: { 'Content-Type': FORM },
      body: formBody({
        api_dev_key: s.pastebinKey,
        api_option: 'paste',
        api_paste_code: content,
        api_paste_name: ShareProviders.TITLE,
        api_paste_format: 'json',
        api_paste_private: 1, // unlisted
        api_paste_expire_date: s.pastebinExpire
      })
    }),
    link: (text) => ShareProviders.linkFromText(text),
    // Pastebin answers errors with 200 and "Bad API request, <reason>"
    error: (text) => /^Bad API request/i.test(String(text || '').trim()) ? String(text).trim().slice(0, 120) : '',
    expiry: (s) => s.pastebinExpire === 'N' ? { kind: 'never' } : { kind: 'pastebin', code: s.pastebinExpire }
  },
  github_gist: {
    name: 'GitHub Gist',
    linkPrefix: 'https://gist.github.com/',
    needs: 'githubToken',
    request: (content, s) => ({
      url: 'https://api.github.com/gists',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        Authorization: `Bearer ${s.githubToken}`
      },
      body: JSON.stringify({ description: ShareProviders.TITLE, public: false, files: { [ShareProviders.FILE_NAME]: { content } } })
    }),
    link: (text) => {
      try {
        return String(JSON.parse(text).html_url || '');
      } catch (e) {
        return '';
      }
    },
    // 401: token wrong or expired; 403/404: token lacks the Gists permission
    httpError: (status) => status === 401 ? 'auth' : (status === 403 || status === 404) ? 'permission' : '',
    expiry: () => ({ kind: 'never' })
  },
  custom: {
    name: 'Custom server',
    needs: 'customUrl',
    request: (content, s) => {
      const tokens = {
        '<CONTENT_JSON>': JSON.stringify(content),
        '<TITLE_JSON>': JSON.stringify(ShareProviders.TITLE),
        '<EXPIRY_DAYS>': String(s.customExpiryDays)
      };
      const fill = (template, encode) => template.replace(/<(?:CONTENT_JSON|TITLE_JSON|EXPIRY_DAYS)>/g,
        (token) => encode ? encodeURIComponent(token === '<EXPIRY_DAYS>' ? tokens[token] : JSON.parse(tokens[token])) : tokens[token]);
      const headers = {};
      let body;
      if (s.customBodyFormat === 'json') {
        headers['Content-Type'] = 'application/json';
        body = fill(s.customJsonTemplate, false);
      } else if (s.customBodyFormat === 'raw') {
        headers['Content-Type'] = 'text/plain; charset=utf-8';
        body = content;
      } else {
        headers['Content-Type'] = FORM;
        body = formBody({ [s.customFieldName]: content, title: ShareProviders.TITLE, expiry_days: s.customExpiryDays });
      }
      for (const [name, value] of ShareProviders.parseHeaderLines(s.customHeaders)) headers[name] = value;
      return { url: fill(s.customUrl, true), method: s.customMethod, headers, body };
    },
    link: (text, response, s) => {
      if (s.customLinkFrom === 'location') return response.location;
      if (s.customLinkFrom === 'json') {
        try {
          const value = ShareProviders.readJsonPath(JSON.parse(text), s.customLinkJsonPath);
          return typeof value === 'string' ? value.trim() : '';
        } catch (e) {
          return '';
        }
      }
      return ShareProviders.linkFromText(text);
    },
    expiry: (s) => ({ kind: 'days', days: s.customExpiryDays })
  }
};

// The custom server: HTTPS to a public host only (same guard as the webhook)
ShareProviders.isCustomUrlAllowed = function(url, isUrlSafe) {
  const probe = String(url || '').replace(/<(?:CONTENT_JSON|TITLE_JSON|EXPIRY_DAYS)>/g, 'x');
  try {
    if (new URL(probe).protocol !== 'https:') return false;
  } catch (e) {
    return false;
  }
  return typeof isUrlSafe === 'function' ? isUrlSafe(probe) === true : false;
};

// Only an https link from where the provider promised; a custom server may
// answer with a link on any https host
ShareProviders.isLinkAllowed = function(providerId, link) {
  const provider = ShareProviders.PROVIDERS[providerId];
  const value = String(link || '');
  if (!provider || !value) return false;
  let parsed;
  try {
    parsed = new URL(value);
  } catch (e) {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (!provider.linkPrefix) return true;
  return value.slice(0, provider.linkPrefix.length).toLowerCase() === provider.linkPrefix;
};

/**
 * What the confirm dialog says: destination name and expiry description.
 * @returns {{ id: string, name: string, expiry: object, missing: string|null }}
 */
ShareProviders.describe = function(rawSettings) {
  const s = ShareProviders.normalize(rawSettings);
  const provider = ShareProviders.PROVIDERS[s.provider];
  let name = provider.name;
  if (s.provider === 'custom' && s.customUrl) {
    try {
      name = new URL(s.customUrl.replace(/<[A-Z_]+>/g, 'x')).host;
    } catch (e) {
      // keep the generic name
    }
  }
  return { id: s.provider, name, expiry: provider.expiry(s), missing: provider.needs && !s[provider.needs] ? provider.needs : null };
};

/**
 * Upload `content` with the configured provider.
 * @param {string} content
 * @param {object} rawSettings settings.share
 * @param {{ fetch: Function, isUrlSafe?: Function }} deps
 * @returns {Promise<string>} the share link (already checked)
 * @throws {Error} with .code: missing | unsafe-url | http | auth | permission | provider | bad-link
 */
ShareProviders.upload = async function(content, rawSettings, deps) {
  const s = ShareProviders.normalize(rawSettings);
  const provider = ShareProviders.PROVIDERS[s.provider];
  const fail = (code, detail) => Object.assign(new Error(detail || code), { code });

  if (provider.needs && !s[provider.needs]) throw fail('missing', provider.needs);
  if (s.provider === 'custom' && !ShareProviders.isCustomUrlAllowed(s.customUrl, deps.isUrlSafe)) {
    throw fail('unsafe-url');
  }

  const req = provider.request(content, s);
  const response = await deps.fetch(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body,
    credentials: 'omit',
    // A link in Location comes with 201 Created, never with a redirect
    redirect: 'error',
    referrerPolicy: 'no-referrer'
  });
  const text = await response.text();
  const providerError = provider.error ? provider.error(text) : '';
  if (providerError) throw fail('provider', providerError);
  const location = response.headers?.get ? (response.headers.get('Location') || '') : '';
  if (!response.ok) {
    const reason = provider.httpError ? provider.httpError(response.status) : '';
    throw fail(reason || 'http', `HTTP ${response.status}`);
  }

  const link = String(provider.link(text, { location }, s) || '').trim();
  if (!ShareProviders.isLinkAllowed(s.provider, link)) throw fail('bad-link');
  return link;
};

if (typeof self !== 'undefined') {
  self.ShareProviders = ShareProviders;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ShareProviders;
}
