function formatLine(title, url) {
  const safeTitle = (title || "")
    .replace(/"/g, '\\"')
    .replace(/\s+/g, " ")
    .trim();
  return `"${safeTitle}": ${url}`;
}

function isInternalUrl(url) {
  return url.startsWith("about:") || url.startsWith("moz-extension:");
}

function isGoogleSearchUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase();

    // Cover google.com + country TLDs + scholar.google.*
    const isGoogle =
      host === "google.com" ||
      host.endsWith(".google.com") ||
      host.includes(".google.") ||
      host.startsWith("www.google.");

    if (!isGoogle) return false;

    const path = u.pathname.toLowerCase();

    // Common search + redirect patterns
    if (path === "/search" || path === "/url") return true;

    // Scholar search
    if (
      host.startsWith("scholar.google.") &&
      (path === "/scholar" || u.searchParams.has("q"))
    )
      return true;

    // WebHP with q param
    if (path === "/webhp" && u.searchParams.has("q")) return true;

    return false;
  } catch {
    return false;
  }
}

async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function getSortKey(mode, tab) {
  if (mode === "domain") {
    try {
      return new URL(tab.url).hostname.toLowerCase();
    } catch {
      return "";
    }
  }
  if (mode === "title") return (tab.title || "").toLowerCase();
  return "";
}

function sortTabs(tabs, mode) {
  if (mode === "none") return tabs; // keep original order
  // Stable sort: decorate -> sort -> undecorate, preserving relative order on ties
  const decorated = tabs.map((t, i) => ({ t, i, k: getSortKey(mode, t) }));
  decorated.sort((a, b) => {
    if (a.k < b.k) return -1;
    if (a.k > b.k) return 1;
    return a.i - b.i;
  });
  return decorated.map((x) => x.t);
}

function buildDiagnostics(stats) {
  const parts = [];
  parts.push(`Exported: ${stats.exported}`);
  if (stats.skippedInternal)
    parts.push(`Skipped internal: ${stats.skippedInternal}`);
  if (stats.skippedGoogle)
    parts.push(`Skipped Google search: ${stats.skippedGoogle}`);
  if (stats.duplicatesRemoved)
    parts.push(`Duplicates removed: ${stats.duplicatesRemoved}`);
  parts.push(`Total tabs seen: ${stats.total}`);
  return parts.join(" • ");
}

function getUIState() {
  return {
    includePinned: document.getElementById("includePinned").checked,
    dedupe: document.getElementById("dedupe").checked,
    skipGoogle: document.getElementById("skipGoogle").checked,
    skipInternal: document.getElementById("skipInternal").checked,
    sortMode: document.getElementById("sortMode").value,
  };
}

async function collectAndFormat({
  includePinned,
  dedupe,
  skipGoogle,
  skipInternal,
  sortMode,
}) {
  const tabs = await browser.tabs.query({ currentWindow: true });

  const stats = {
    total: tabs.length,
    skippedInternal: 0,
    skippedGoogle: 0,
    duplicatesRemoved: 0,
    exported: 0,
  };

  // Filter (counts tracked)
  let filtered = [];
  for (const t of tabs) {
    if (!t.url) continue;

    if (!includePinned && t.pinned) continue;

    if (skipInternal && isInternalUrl(t.url)) {
      stats.skippedInternal++;
      continue;
    }

    if (skipGoogle && isGoogleSearchUrl(t.url)) {
      stats.skippedGoogle++;
      continue;
    }

    filtered.push(t);
  }

  // Deduplicate by URL (keep first occurrence)
  if (dedupe) {
    const seen = new Set();
    const deduped = [];
    for (const t of filtered) {
      if (seen.has(t.url)) {
        stats.duplicatesRemoved++;
        continue;
      }
      seen.add(t.url);
      deduped.push(t);
    }
    filtered = deduped;
  }

  // Sort (optional)
  filtered = sortTabs(filtered, sortMode);

  const lines = filtered.map((t) => formatLine(t.title, t.url));
  const text = lines.join("\n\n");
  stats.exported = lines.length;

  return { text, stats };
}

async function downloadTextFile(text) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const filename = `tabs_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )}_${pad(now.getHours())}${pad(now.getMinutes())}.txt`;

  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    await browser.downloads.download({
      url,
      filename,
      saveAs: true,
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

function setOutput(text, diag) {
  const output = document.getElementById("output");
  const diagEl = document.getElementById("diag");
  output.value = text;
  diagEl.textContent = diag;
}

/**
 * Auto-update preview:
 * - Runs when popup opens
 * - Updates textarea + diagnostics
 * - DOES NOT copy to clipboard
 */
async function refreshPreview() {
  try {
    const { text, stats } = await collectAndFormat(getUIState());
    setOutput(text, buildDiagnostics(stats));
  } catch (err) {
    setOutput("", `Error: ${err?.message || err}`);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Auto-populate textarea on open (no clipboard copy)
  refreshPreview();

  // If user toggles settings in the popup, refresh preview live (still no copy)
  for (const id of [
    "includePinned",
    "dedupe",
    "skipGoogle",
    "skipInternal",
    "sortMode",
  ]) {
    const el = document.getElementById(id);
    el.addEventListener("change", refreshPreview);
  }
});

document.getElementById("copy").addEventListener("click", async () => {
  try {
    const { text, stats } = await collectAndFormat(getUIState());
    setOutput(text, buildDiagnostics(stats));

    const ok = await copyTextToClipboard(text);
    if (!ok) {
      document.getElementById("diag").textContent +=
        " • Copy failed (use manual copy from box)";
    } else {
      // Nice UX: select text after copying so it's easy to Cmd+V elsewhere
      const output = document.getElementById("output");
      output.focus();
      output.select();
    }
  } catch (err) {
    setOutput("", `Error: ${err?.message || err}`);
  }
});

document.getElementById("download").addEventListener("click", async () => {
  try {
    const { text, stats } = await collectAndFormat(getUIState());
    setOutput(text, buildDiagnostics(stats));
    await downloadTextFile(text);
  } catch (err) {
    setOutput("", `Error: ${err?.message || err}`);
  }
});
