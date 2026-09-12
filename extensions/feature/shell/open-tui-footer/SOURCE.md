# Footer source

Adapted from [OldSuns/pi-open-tui](https://github.com/OldSuns/pi-open-tui/tree/d65d426cb79e25b0979644846482751418847212/extensions/open-tui), commit `d65d426cb79e25b0979644846482751418847212`.

The two-row footer layout, glyphs, colors, usage formatting and runtime detection retain the original MIT license in this directory. Only footer-related code is included. This does not load pi-open-tui as a second extension.

Integration changes connect the existing whole-second run tracker, retain unknown-context and subscription information, isolate session caches and disposal, and read existing icon/footer preferences without rewriting them.

The cost glyph already denotes USD in both ASCII and Nerd Font modes, so the amount does not add a second dollar prefix.

Upstream uses the active Pi theme. This fork selects Pi's built-in `dark` palette for the footer so it keeps Open TUI's default dark appearance under conversation themes such as `cc-dark`. If that palette is unavailable, it falls back to the active theme.

The footer lifecycle also synchronizes the `cc-codex` terminal background and restores the previous background on disposal. This is separate from the footer's own foreground palette.
