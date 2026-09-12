# Footer source

Adapted from [OldSuns/pi-open-tui](https://github.com/OldSuns/pi-open-tui/tree/d65d426cb79e25b0979644846482751418847212/extensions/open-tui), commit `d65d426cb79e25b0979644846482751418847212`.

The two-row footer layout, glyphs, colors, usage formatting and runtime detection retain the original MIT license in this directory. Only footer-related code is included. This does not load pi-open-tui as a second extension.

Integration changes connect the existing whole-second run tracker, retain unknown-context and subscription information, isolate session caches and disposal, and read existing icon/footer preferences without rewriting them.
