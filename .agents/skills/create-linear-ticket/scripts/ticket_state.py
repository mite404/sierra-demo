#!/usr/bin/env python3
"""Read/write the ticket front-matter block that makes filing idempotent.

This block is the ONLY record of whether a plan has already been filed.
A bug here files duplicate Linear and GitHub issues, so it carries a
self-check: python3 ticket_state.py --selfcheck

DO NOT HAND-EDIT COMMENTS OR PROSE INTO THIS BLOCK, and keep every line
short enough that no markdown line-wrapping hook will fold it. Only
`key: value` lines are permitted and the rule is all-or-nothing: one
non-conforming line makes the whole block stop parsing. When the wreckage
still mentions a managed key, read() and write() raise DamagedFrontMatter
rather than answer "unfiled" — that answer would file the plan a second
time in both Linear and GitHub. Storing short identifiers (`linear: ETH-47`,
14 columns) instead of URLs is what keeps the block under any wrap limit.

The strictness is deliberate. It is what stops a document whose body opens
with a markdown horizontal rule from having everything up to the next rule
silently deleted by write(). Relaxing it to tolerate `#` lines would reopen
that data loss for any doc shaped `---` / `# Heading` / `---`.

write() preserves any *other* key: value lines already in a valid block
(e.g. a doc's own `title:`/`status:`) instead of discarding them — KEYS is
an allowlist for what this script reads and manages, not for what it lets
survive a write. A leading block that looks like an attempted multi-line
YAML mapping/list (a `key:` line with no value) is refused with a non-zero
exit rather than silently doubled into two blocks.
"""
import json
import pathlib
import re
import sys

# Fixed emit order. Also the allowlist — see selfcheck case 7. `linear_url`
# is read for tickets filed before it was dropped; nothing writes it now, as
# a full Linear URL is long enough to be folded by a wrapping hook and the
# URL is re-derivable from the `ETH-NN` identifier anyway. See case 13.
KEYS = ("linear", "linear_url", "github", "filed")

# Front-matter only counts at the very start of the file.
FM = re.compile(r"\A---\n(.*?)\n---\n", re.S)

# A managed key anywhere in a leading block that failed validation. Such a
# block was written by this script and has since been damaged (a markdown
# line-wrapper folding a long value onto its own line is the known cause).
# Reporting it as unfiled would file a duplicate Linear issue, which is the
# single failure this whole file exists to prevent, so it is an error.
DAMAGED = re.compile(r"^\s*(linear|linear_url|github|filed)\s*:", re.M)


class DamagedFrontMatter(ValueError):
    """A leading block mentions a managed key but no longer parses."""


def _classify_frontmatter(block):
    """Classify a leading block as 'valid', 'malformed', or 'prose'.

    'valid'    — every non-empty line is 'key: value' with a non-empty
                 value. Safe to parse and to strip on write.
    'malformed' — at least one line looks like an attempted YAML key with
                 no value (e.g. 'tags:' opening a nested list). This is
                 the shape a hand-written multi-line YAML block takes, not
                 the shape of prose. write() refuses rather than prepend a
                 second block on top of it.
    'prose'    — anything else that fails validity (e.g. no colon at all).
                 Treated as ordinary body text, exactly like "no front
                 matter here" — this is what stops a markdown '---' rule
                 followed by body text from being misread as front-matter.
    """
    if not block.strip():
        return "prose"
    all_valid = True
    has_empty_value_key = False
    for line in block.splitlines():
        if not line.strip():  # empty lines are OK
            continue
        key, sep, value = line.partition(":")
        if sep and not value.strip():
            has_empty_value_key = True
        if not sep or not value.strip():
            all_valid = False
    if all_valid:
        return "valid"
    return "malformed" if has_empty_value_key else "prose"


def _is_valid_frontmatter(block):
    """Check if a block is valid YAML-like front-matter (see selfcheck case 7)."""
    return _classify_frontmatter(block) == "valid"


def _parse_pairs(block):
    """All key: value pairs in a *valid* block, in file order. Unlike read(),
    not filtered to KEYS — this is what lets write() round-trip a doc's own
    front-matter fields instead of discarding them."""
    pairs = []
    for line in block.splitlines():
        if not line.strip():
            continue
        key, sep, value = line.partition(":")
        pairs.append((key.strip(), value.strip()))
    return pairs


def read(text):
    """Return the front-matter as a dict, filtered to KEYS. {} means unfiled.

    Raises DamagedFrontMatter if the leading block still mentions a managed
    key but no longer parses — that is a filed ticket with a broken block,
    not an unfiled one, and the difference is a duplicate issue.
    """
    m = FM.match(text)
    if not m:
        return {}
    block = m.group(1)
    if not _is_valid_frontmatter(block):
        if DAMAGED.search(block):
            raise DamagedFrontMatter(
                "leading block mentions a managed key but is not flat "
                "'key: value' lines (a line-wrapping hook folding a long "
                "value is the usual cause). Refusing to report this as "
                "unfiled; repair the block by hand first."
            )
        return {}
    return {k: v for k, v in _parse_pairs(block) if k in KEYS}


def write(text, updates):
    """Merge updates into the block and return the new file text.

    Merge, never replace: a run that died after creating the Linear issue
    leaves `linear:` behind, and the next run must add `github:` without
    losing it. Unknown keys already in a valid block (a doc's own
    `title:`, `status:`, ...) are preserved too — KEYS is the allowlist for
    what this script manages, not for what it's allowed to destroy. KEYS
    are emitted first in fixed order; any other keys follow in the order
    they first appeared.

    Raises ValueError instead of writing if the leading block is malformed
    in a way that looks like an attempted multi-line YAML block — see
    _classify_frontmatter.
    """
    m = FM.match(text)
    kind = _classify_frontmatter(m.group(1)) if m else "prose"
    if kind != "valid" and m and DAMAGED.search(m.group(1)):
        raise DamagedFrontMatter(
            "leading block mentions a managed key but does not parse; "
            "prepending a second block would double the front matter. "
            "Repair it by hand first."
        )
    if kind == "malformed":
        raise ValueError(
            "front matter block is not flat 'key: value' lines (looks like "
            "multi-line YAML, e.g. a list under a key); refusing to write a "
            "second block on top of it"
        )
    valid = kind == "valid"
    existing_pairs = _parse_pairs(m.group(1)) if valid else []
    data = dict(existing_pairs)
    data.update({k: str(v) for k, v in updates.items() if v is not None})

    other_keys = []
    seen = set()
    for k, _ in existing_pairs:
        if k not in KEYS and k not in seen:
            seen.add(k)
            other_keys.append(k)
    order = [k for k in KEYS if k in data] + [k for k in other_keys if k in data]

    block = "---\n" + "".join(f"{k}: {data[k]}\n" for k in order) + "---\n"
    # Only strip the old block if it was valid front-matter
    body = text[m.end():] if valid else text
    return block + body


def selfcheck():
    plain = "# Plan 004: Do a thing\n\nBody text.\n"

    # 1. A file with no front-matter reads as unfiled.
    assert read(plain) == {}, "unfiled file must read as {}"

    # 2. A partial write (Linear only, GitHub not yet created) round-trips.
    once = write(plain, {"linear": "ETH-21"})
    assert read(once) == {"linear": "ETH-21"}, "partial write must round-trip"

    # 3. The body survives verbatim — the block is prepended, not merged in.
    assert once.endswith(plain), "body must be preserved byte-for-byte"

    # 4. A second write merges instead of replacing. This is the resume path:
    #    a run that died after Linear must be completable by a later run.
    twice = write(once, {"github": "61", "filed": "2026-08-20"})
    assert read(twice) == {
        "linear": "ETH-21",
        "github": "61",
        "filed": "2026-08-20",
    }, "second write must merge, not replace"

    # 5. Writing twice must not stack two front-matter blocks. Duplicate blocks
    #    are how "already filed?" starts returning the wrong answer.
    assert twice.count("---\n") == 2, "exactly one front-matter block"
    assert twice.endswith(plain), "body still preserved after second write"

    # 6. Keys always emit in fixed order, so diffs stay readable.
    lines = twice.split("---\n")[1].strip().splitlines()
    assert [l.split(":")[0] for l in lines] == [
        "linear",
        "github",
        "filed",
    ], f"key order wrong: {lines}"

    # 7. read() filters to KEYS — an unknown key in an existing block doesn't
    #    show up in the returned dict (read()'s contract is unchanged by the
    #    write()-preservation fix in cases 11-12 below).
    noisy = "---\nlinear: ETH-9\nnonsense: x\n---\n" + plain
    assert read(noisy) == {"linear": "ETH-9"}, "read() filters to KEYS"

    # 8. A file whose body opens with a bare --- rule and contains another ---
    #    later: read returns {}, and write preserves the entire original body verbatim.
    #    This catches the silent data loss bug where a markdown rule in the body
    #    was misread as front-matter.
    body_with_rules = "---\n\nSome intro text under a rule.\n\n---\n\nMore content.\n"
    assert read(body_with_rules) == {}, "body starting with --- not treated as front-matter"
    written = write(body_with_rules, {"linear": "ETH-1"})
    assert written.startswith("---\nlinear: ETH-1\n---\n"), "block prepended"
    assert body_with_rules in written, "original body with rules preserved verbatim"

    # 9. A block that is partly key: value and partly prose is NOT treated as
    #    front-matter. The mixed content means it's body text, not managed metadata.
    mixed = "---\nauthor: ethan\nsome prose here\n---\n" + plain
    assert read(mixed) == {}, "mixed key:value and prose not front-matter"
    written = write(mixed, {"linear": "ETH-2"})
    assert written.startswith("---\nlinear: ETH-2\n---\n"), "new block prepended"
    assert mixed in written, "original mixed content preserved"

    # 10. linear_url round-trips through write→read and emits in the correct
    #     position (between linear and github).
    with_url = write(plain, {"linear": "ETH-3", "linear_url": "https://example.com/ETH-3", "github": "42"})
    data = read(with_url)
    assert data == {
        "linear": "ETH-3",
        "linear_url": "https://example.com/ETH-3",
        "github": "42",
    }, "linear_url round-trips"
    lines = with_url.split("---\n")[1].strip().splitlines()
    keys = [l.split(":")[0] for l in lines]
    assert keys == ["linear", "linear_url", "github"], f"linear_url in correct position: {keys}"

    # 11. write() must not discard a document's own front-matter keys. This
    #     is the silent-data-loss bug: KEYS is not the whole allowlist for
    #     what write() rebuilds the block from. Unknown keys round-trip and
    #     keep their relative order; KEYS still emit first, in fixed order.
    own_fm = "---\ntitle: Fix the thing\nstatus: draft\nowner: ethan\n---\n# Plan 004\n\nBody.\n"
    assert read(own_fm) == {}, "doc's own keys don't make it look already-filed"
    filed = write(own_fm, {"linear": "ETH-99"})
    assert read(filed) == {"linear": "ETH-99"}, "filing key readable after write"
    lines = filed.split("---\n")[1].strip().splitlines()
    keys = [l.split(":")[0] for l in lines]
    assert keys == ["linear", "title", "status", "owner"], (
        f"KEYS first, then unknown keys in original order: {keys}"
    )
    assert "title: Fix the thing" in filed
    assert "status: draft" in filed
    assert "owner: ethan" in filed
    assert filed.endswith("# Plan 004\n\nBody.\n"), "doc body preserved"

    # 12. A leading block that looks like attempted multi-line YAML (a
    #     'key:' with no value, e.g. a list) is refused, not silently
    #     doubled into two front-matter blocks.
    multiline_yaml = "---\ntags:\n  - bug\n---\n# Plan 005\n"
    try:
        write(multiline_yaml, {"linear": "ETH-1"})
        raise AssertionError("expected write() to refuse malformed multi-line YAML")
    except ValueError:
        pass

    # 13. A block damaged after filing — the known cause is a markdown
    #     line-wrapping hook folding a long value onto its own line — must
    #     NOT read as unfiled. Reporting {} here files a duplicate Linear
    #     issue, the one failure this file exists to prevent.
    wrapped = (
        "---\nlinear: ETH-47\nlinear_url:\n  https://linear.app/x/issue/ETH-47\n"
        "github: 110\n---\n" + plain
    )
    for fn, args in ((read, ()), (write, ({"github": "111"},))):
        try:
            fn(wrapped, *args)
            raise AssertionError(f"expected {fn.__name__}() to refuse a damaged block")
        except DamagedFrontMatter:
            pass

    # 14. The guard is scoped to managed keys: a damaged leading block with
    #     none of them is still ordinary body text, as in cases 8 and 9.
    assert read("---\nnot front matter\n---\n" + plain) == {}

    print("OK")
    return 0


def main(argv):
    if "--selfcheck" in argv:
        return selfcheck()
    if len(argv) < 3:
        print(
            "usage: ticket_state.py read|write <path.md> [--linear ETH-1] "
            "[--linear-url URL] [--github 57] [--filed YYYY-MM-DD]",
            file=sys.stderr,
        )
        return 2
    cmd, path = argv[1], pathlib.Path(argv[2])
    text = path.read_text()
    if cmd == "read":
        try:
            print(json.dumps(read(text)))
        except DamagedFrontMatter as e:
            print(f"error: {e}", file=sys.stderr)
            return 1
        return 0
    if cmd == "write":
        flags = argv[3:]
        updates = {
            flags[i].lstrip("-").replace("-", "_"): flags[i + 1]
            for i in range(0, len(flags) - 1, 2)
        }
        try:
            new_text = write(text, updates)
        except ValueError as e:
            print(f"error: {e}", file=sys.stderr)
            return 1
        path.write_text(new_text)
        print(json.dumps(read(path.read_text())))
        return 0
    print(f"unknown command: {cmd}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
