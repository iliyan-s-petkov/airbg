package web

// minifyCSS strips comments and collapses whitespace outside quoted strings.
// Rules and values are left as written.
func minifyCSS(raw []byte) []byte {
	out := make([]byte, 0, len(raw))
	inString := byte(0) // 0 = not in a string, else the quote byte that opened it
	lastWasSpace := false

	for i := 0; i < len(raw); i++ {
		c := raw[i]

		if inString != 0 {
			out = append(out, c)
			if c == '\\' && i+1 < len(raw) {
				// An escaped quote does not close the string.
				i++
				out = append(out, raw[i])
				continue
			}
			if c == inString {
				inString = 0
			}
			continue
		}

		if c == '"' || c == '\'' {
			inString = c
			out = append(out, c)
			lastWasSpace = false
			continue
		}

		if c == '/' && i+1 < len(raw) && raw[i+1] == '*' {
			end := indexFrom(raw, "*/", i+2)
			if end < 0 {
				break // unterminated comment: drop the rest rather than emit garbage
			}
			i = end + 1 // skip past the closing "*/"
			continue
		}

		if c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' {
			if !lastWasSpace {
				out = append(out, ' ')
				lastWasSpace = true
			}
			continue
		}

		out = append(out, c)
		lastWasSpace = false
	}

	return out
}

// indexFrom finds sub in s starting at (and including) offset from, or -1.
func indexFrom(s []byte, sub string, from int) int {
	if from >= len(s) {
		return -1
	}
	for i := from; i+len(sub) <= len(s); i++ {
		if string(s[i:i+len(sub)]) == sub {
			return i
		}
	}
	return -1
}
