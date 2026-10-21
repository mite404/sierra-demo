#!/usr/bin/env bun
/**
 * wrap-md.js — Wrap long lines in markdown files to stay under 100 bytes per line.
 *
 * Usage:
 *   bun scripts/wrap-md.js docs/FOR_ETHAN.md
 *   bun scripts/wrap-md.js docs/*.md
 *
 * Rules:
 *   - Lines inside code blocks (``` fences) are never wrapped
 *   - Table rows (starting with |) are never wrapped (would break markdown)
 *   - Headings (starting with #) are never wrapped
 *   - A leading YAML frontmatter block (--- ... ---) is never wrapped
 *   - All other lines over 100 bytes are wrapped at the nearest word boundary
 *
 * Why bytes, not characters?
 *   awk and most linters count bytes, not JS string characters.
 *   Multi-byte chars like em-dashes (—) are 3 bytes but 1 JS char.
 *   Using Buffer.byteLength() keeps our count in sync with the linter.
 */

import { readFileSync, writeFileSync } from "fs";

const MAX_BYTES = 100;

// Count bytes (not JS characters) to match what linters see
function byteLen(str) {
  return Buffer.byteLength(str, "utf8");
}

// Wrap a single line to under MAX_BYTES, splitting at word boundaries
// Preserves blockquote (>), list item (-, *, N.), and plain-indent prefixes on
// continuation lines, so an already-indented continuation line stays indented
// (markdown reads a col-0 continuation as lazy-continuation, but flattening the
// source loses the visible structure this file's docs rely on).
function wrapLine(line) {
  if (byteLen(line) <= MAX_BYTES) return [line];

  // Detect blockquote prefix: one or more > followed by optional space
  const bqMatch = line.match(/^(>+\s*)/);
  // Detect list item prefix: optional indent, then -/* + space or digits + . + space
  const listMatch = line.match(/^(\s*)([-*]\s+|\d+\.\s+)/);
  // Detect a plain leading indent (a continuation line that is not itself a
  // list marker or blockquote). Checked last so list/blockquote win.
  const indentMatch = line.match(/^(\s+)/);

  let prefix = "";
  let content = line;
  let contPrefix = "";

  if (bqMatch) {
    prefix = bqMatch[1];
    content = line.slice(prefix.length);
    contPrefix = prefix;
  } else if (listMatch) {
    prefix = listMatch[1] + listMatch[2];
    content = line.slice(prefix.length);
    contPrefix = " ".repeat(prefix.length);
  } else if (indentMatch) {
    // Keep the same indent on every wrapped line, so the continuation stays
    // visually attached to its parent list item / paragraph.
    prefix = indentMatch[1];
    content = line.slice(prefix.length);
    contPrefix = prefix;
  }

  const words = content.split(" ");
  const outputLines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const checkPrefix = outputLines.length === 0 ? prefix : contPrefix;
    if (byteLen(checkPrefix + candidate) <= MAX_BYTES) {
      current = candidate;
    } else {
      if (current) outputLines.push(current);
      current = word;
    }
  }

  if (current) outputLines.push(current);

  // Re-add prefixes
  return outputLines.map((l, i) => (i === 0 ? prefix : contPrefix) + l);
}

// Process a single file
function processFile(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const output = [];
  let inCodeBlock = false;
  // YAML frontmatter (e.g. SKILL.md) breaks if a value wraps onto an unindented line.
  const frontmatterEnd = lines[0] === "---" ? lines.indexOf("---", 1) : -1;

  for (const [i, line] of lines.entries()) {
    // Toggle code block tracking when we hit a fence
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      output.push(line);
      continue;
    }

    // Never touch frontmatter, lines inside code blocks, table rows, or headings
    const isProtected =
      i <= frontmatterEnd || inCodeBlock || line.startsWith("|") || line.startsWith("#");

    if (isProtected || byteLen(line) <= MAX_BYTES) {
      output.push(line);
    } else {
      // Wrap and push potentially multiple lines
      for (const wrapped of wrapLine(line)) {
        output.push(wrapped);
      }
    }
  }

  writeFileSync(filePath, output.join("\n"));

  // Report how many lines are still over limit (should only be tables/code)
  const remaining = output.filter((l) => !l.startsWith("|") && byteLen(l) > MAX_BYTES).length;

  console.log(`✓ ${filePath} — ${remaining} long non-table lines remaining`);
}

// Read file paths from CLI args
const files = process.argv.slice(2);

if (files.length === 0) {
  console.error("Usage: bun scripts/wrap-md.js <file.md> [file.md ...]");
  process.exit(1);
}

for (const file of files) {
  processFile(file);
}
