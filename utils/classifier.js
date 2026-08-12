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

  // 1. PRIORITY 1: Domain Exact/Subdomain Matching (登録済みドメイン最優先)
  // This prevents title keyword false positives from misclassifying known domains!
  for (const cat of activeCategories) {
    if (cat.domains && Array.isArray(cat.domains)) {
      const domainMatch = cat.domains.some(d => {
        const cleanDomain = d.trim().toLowerCase();
        if (!cleanDomain) return false;
        return hostname === cleanDomain || hostname.endsWith("." + cleanDomain);
      });
      if (domainMatch) {
        return cat;
      }
    }
  }

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

  // 4. PRIORITY 4: Domain Fallback
  if (settings.groupByDomainAsFallback) {
    const domainParts = hostname.split(".");
    let displayDomain = hostname;
    if (domainParts.length >= 2) {
      displayDomain = domainParts.slice(-2).join(".");
    }
    return {
      id: `cat_fallback_${displayDomain}`,
      name: `🌐 ${displayDomain}`,
      color: "grey",
      isFallback: true
    };
  }

  return null;
}
