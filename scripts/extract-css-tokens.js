// Paste into the Chrome DevTools console on any page (e.g. meetkay.ai or yaklabs.ai).
// Prints the page's CSS custom properties and every colour actually used, then copies a
// JSON report to the clipboard. Brand colours come only from declared CSS (ADR-051), so the
// "declared" list is the source of truth; "used" shows where each colour appears.
(() => {
  const declared = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      console.warn("Skipped a cross-origin sheet:", sheet.href);
      continue;
    }
    const walk = (list) => {
      for (const rule of list) {
        if (rule.cssRules) walk(rule.cssRules); // @media, @supports, @layer
        if (!rule.style) continue;
        for (const name of rule.style) {
          if (name.startsWith("--"))
            declared.push({
              token: name,
              value: rule.style.getPropertyValue(name).trim(),
              selector: rule.selectorText ?? "",
              media: rule.parentRule?.conditionText ?? "",
              sheet: sheet.href ? new URL(sheet.href).pathname : "inline <style>",
            });
        }
      }
    };
    walk(rules);
  }

  const props = [
    "color",
    "background-color",
    "border-top-color",
    "outline-color",
    "fill",
    "stroke",
    "text-decoration-color",
  ];
  const used = new Map();
  for (const el of document.querySelectorAll("body, body *")) {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") continue;
    for (const prop of props) {
      const value = style.getPropertyValue(prop);
      if (!value || value === "rgba(0, 0, 0, 0)" || value === "none") continue;
      if (prop.startsWith("border") && style.borderTopStyle === "none") continue;
      const key = `${value} | ${prop}`;
      const entry = used.get(key) ?? { colour: value, property: prop, count: 0, example: "" };
      entry.count++;
      if (!entry.example)
        entry.example =
          el.tagName.toLowerCase() +
          (el.className && typeof el.className === "string"
            ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
            : "");
      used.set(key, entry);
    }
  }
  const usedList = [...used.values()].toSorted((a, b) => b.count - a.count);

  console.log(`%c${declared.length} declared custom properties`, "font-weight:bold");
  console.table(declared);
  console.log(`%c${usedList.length} colour uses (computed)`, "font-weight:bold");
  console.table(usedList);
  const report = { page: location.href, declared, used: usedList };
  if (typeof copy === "function") {
    copy(JSON.stringify(report, null, 2));
    console.log("Copied the JSON report to the clipboard.");
  }
  return report;
})();
