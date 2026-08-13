/**
 * Smart Tab Classifier Utility with Priority Matching & False Positive Protection
 */

export function getDomainFromUrl(urlString) {
  if (!urlString) return "";
  try {
    const url = new URL(urlString);
    return url.hostname.toLowerCase();
  } catch (e) {
    return "";
  }
}

export function classifyTab(tab, categories, settings = {}) {
  const urlString = tab.url || tab.pendingUrl || "";
  const title = (tab.title || "").toLowerCase();

  // Internal Chrome/Edge URLs and system pages
  if (urlString.startsWith("chrome://") || urlString.startsWith("edge://") || urlString.startsWith("about:")) {
    return {
      id: "cat_system",
      name: "⚙️ システム",
      color: "grey",
      isSystem: true
    };
  }

  const hostname = getDomainFromUrl(urlString);
  if (!hostname) {
    return null;
  }

  // 0. Exclusion / Blacklist Check (誤検知・除外リスト)
  if (settings.exclusions && Array.isArray(settings.exclusions)) {
    const isExcluded = settings.exclusions.some(item => {
      const clean = item.trim().toLowerCase();
      if (!clean) return false;
      return hostname === clean || hostname.endsWith("." + clean) || urlString.toLowerCase().includes(clean);
    });
    if (isExcluded) {
      return null; // Excluded from auto-grouping
    }
  }

  const activeCategories = categories.filter(c => c.enabled);

  // 1. PRIORITY 1: Longest registered domain match.
  // A specific rule such as mail.google.com wins over google.com.
  const domainMatch = findLongestDomainMatch(hostname, activeCategories);
  if (domainMatch) return domainMatch.category;

  // 2. PRIORITY 2: Custom Regex Matching
  for (const cat of activeCategories) {
    if (cat.regexRules && Array.isArray(cat.regexRules)) {
      const regexMatch = cat.regexRules.some(pattern => {
        if (!pattern) return false;
        try {
          const re = new RegExp(pattern, "i");
          return re.test(urlString) || re.test(tab.title || "");
        } catch (e) {
          return false;
        }
      });
      if (regexMatch) {
        return cat;
      }
    }
  }

  // 3. PRIORITY 3: Title Keyword Matching (Evaluated only if no domain matched)
  for (const cat of activeCategories) {
    if (cat.titleKeywords && Array.isArray(cat.titleKeywords)) {
      const keywordMatch = cat.titleKeywords.some(kw => {
        const cleanKw = kw.trim().toLowerCase();
        if (!cleanKw || cleanKw.length < 2) return false; // Ignore trivial 1-char keywords to avoid false positives
        return title.includes(cleanKw);
      });
      if (keywordMatch) {
        return cat;
      }
    }
  }

  // 4. OPTIONAL: Put every unmatched tab into one neutral group.
  // The default is off, so an unmatched tab is left exactly where it is.
  if (settings.groupUnmatchedAsOthers === true) {
    return {
      id: "cat_others",
      name: "Others",
      color: "grey",
      isFallback: true
    };
  }

  return null;
}

export function findLongestDomainMatch(hostname, categories) {
  let best = null;
  for (let categoryIndex = 0; categoryIndex < categories.length; categoryIndex += 1) {
    const category = categories[categoryIndex];
    if (!Array.isArray(category.domains)) continue;
    for (const rawDomain of category.domains) {
      const domain = String(rawDomain || '').trim().toLowerCase().replace(/^\*\./, '');
      if (!domain) continue;
      if (hostname !== domain && !hostname.endsWith(`.${domain}`)) continue;
      if (!best || domain.length > best.domain.length) {
        best = { category, domain, categoryIndex };
      }
    }
  }
  return best;
}
