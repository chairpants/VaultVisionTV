"""Parse the web build's `shows/<id>/data.js` files without a JS runtime.

Each file is a plain data literal (`window.SHOW = { ... };`), occasionally
preceded by a `const NAME = '...';` that gets referenced inside the episode
list. There's no Node on this machine, so this is a small recursive-descent
reader for the literal subset those files actually use: objects, arrays,
strings, numbers, booleans, null, identifier references, and `+` concatenation.

Vendored verbatim from VaultVisionRoku/tools/jsdata.py — build-catalog.py
here needs the exact same subset of `data.js` (Roku's catalog builder reads
the same files), so this copy stays in sync by re-copying rather than adding
a cross-repo import.
"""

import re


class JsParseError(ValueError):
    pass


_IDENT = re.compile(r"[A-Za-z_$][A-Za-z0-9_$]*")
_NUMBER = re.compile(r"-?(?:0[xX][0-9a-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+)")


class _Reader:
    def __init__(self, text, consts=None):
        self.s = text
        self.i = 0
        self.consts = consts or {}

    # -- lexing helpers ----------------------------------------------------
    def skip(self):
        """Advance past whitespace and both comment styles."""
        while self.i < len(self.s):
            c = self.s[self.i]
            if c in " \t\r\n":
                self.i += 1
            elif self.s.startswith("//", self.i):
                nl = self.s.find("\n", self.i)
                self.i = len(self.s) if nl == -1 else nl + 1
            elif self.s.startswith("/*", self.i):
                end = self.s.find("*/", self.i + 2)
                if end == -1:
                    raise JsParseError("unterminated block comment")
                self.i = end + 2
            else:
                return

    def peek(self):
        self.skip()
        return self.s[self.i] if self.i < len(self.s) else ""

    def expect(self, ch):
        if self.peek() != ch:
            raise JsParseError(
                "expected %r at offset %d, found %r" % (ch, self.i, self.s[self.i:self.i + 30])
            )
        self.i += 1

    # -- value parsing -----------------------------------------------------
    def value(self):
        """Parse one value, folding any `a + b` string concatenation."""
        parts = [self.atom()]
        while True:
            save = self.i
            if self.peek() == "+":
                self.i += 1
                parts.append(self.atom())
            else:
                self.i = save
                break
        if len(parts) == 1:
            return parts[0]
        if all(isinstance(p, str) for p in parts):
            return "".join(parts)
        total = 0
        for p in parts:
            if not isinstance(p, (int, float)):
                raise JsParseError("cannot fold mixed concatenation")
            total += p
        return total

    def atom(self):
        c = self.peek()
        if c == "":
            raise JsParseError("unexpected end of input")
        if c == "{":
            return self.obj()
        if c == "[":
            return self.arr()
        if c in "\"'`":
            return self.string()
        m = _NUMBER.match(self.s, self.i)
        if m and (c.isdigit() or c == "-" or c == "."):
            self.i = m.end()
            raw = m.group(0)
            if raw.lower().startswith(("0x", "-0x")):
                return int(raw, 16)
            return float(raw) if ("." in raw or "e" in raw.lower()) else int(raw)
        m = _IDENT.match(self.s, self.i)
        if m:
            self.i = m.end()
            word = m.group(0)
            if word == "true":
                return True
            if word == "false":
                return False
            if word in ("null", "undefined"):
                return None
            if word in self.consts:
                return self.consts[word]
            raise JsParseError("unresolved identifier %r" % word)
        raise JsParseError("unexpected %r at offset %d" % (c, self.i))

    def string(self):
        quote = self.s[self.i]
        self.i += 1
        out = []
        while True:
            if self.i >= len(self.s):
                raise JsParseError("unterminated string")
            c = self.s[self.i]
            if c == "\\":
                nxt = self.s[self.i + 1]
                mapping = {"n": "\n", "t": "\t", "r": "\r", "b": "\b", "f": "\f", "0": "\0"}
                if nxt == "u":
                    out.append(chr(int(self.s[self.i + 2:self.i + 6], 16)))
                    self.i += 6
                    continue
                if nxt == "x":
                    out.append(chr(int(self.s[self.i + 2:self.i + 4], 16)))
                    self.i += 4
                    continue
                out.append(mapping.get(nxt, nxt))
                self.i += 2
                continue
            if c == quote:
                self.i += 1
                return "".join(out)
            out.append(c)
            self.i += 1

    def arr(self):
        self.expect("[")
        items = []
        while True:
            if self.peek() == "]":
                self.i += 1
                return items
            items.append(self.value())
            if self.peek() == ",":
                self.i += 1
            elif self.peek() == "]":
                self.i += 1
                return items
            else:
                raise JsParseError("bad array at offset %d" % self.i)

    def obj(self):
        self.expect("{")
        out = {}
        while True:
            c = self.peek()
            if c == "}":
                self.i += 1
                return out
            if c in "\"'":
                key = self.string()
            else:
                m = _IDENT.match(self.s, self.i) or _NUMBER.match(self.s, self.i)
                if not m:
                    raise JsParseError("bad object key at offset %d" % self.i)
                self.i = m.end()
                key = m.group(0)
            self.expect(":")
            out[key] = self.value()
            if self.peek() == ",":
                self.i += 1
            elif self.peek() == "}":
                self.i += 1
                return out
            else:
                raise JsParseError("bad object at offset %d" % self.i)


def parse_show(text):
    """Return the object assigned to `window.SHOW`, resolving leading consts."""
    consts = {}
    for m in re.finditer(r"(?m)^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=", text):
        reader = _Reader(text, consts)
        reader.i = m.end()
        try:
            consts[m.group(1)] = reader.value()
        except JsParseError:
            pass  # a non-literal initialiser is fine as long as nothing needs it

    m = re.search(r"window\.SHOW\s*=", text)
    if not m:
        raise JsParseError("no window.SHOW assignment")
    reader = _Reader(text, consts)
    reader.i = m.end()
    return reader.value()
