# Tab Link Exporter

Export the tabs in your current window as a plain-text list of links (with optional filtering, deduplication, and sorting), then copy it to your clipboard or download it as a `.txt` file.

- Open the extension popup.
- Toggle options: include pinned, dedupe URLs, skip Google search pages, skip internal pages, and sort by tab order/domain/title.
- Click `Copy` or `Download .txt`.

Output format is one entry per tab as:

```txt
"Tab Title": https://example.com

"Tab Title 2": https://example2.com
...
```

Permissions used: `tabs` (read current-window tabs), `clipboardWrite` (copy), `downloads` (save `.txt`).

To use the extension in Firefox or Chrome, you will need to load the extension as an unpacked extension in developer mode.
