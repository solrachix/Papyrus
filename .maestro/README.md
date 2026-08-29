# Papyrus mobile device smoke tests

The repository currently has no Detox/Maestro runner or mobile CI job. This
small flow uses Maestro because it is declarative, can drive the existing
React Native example without adding a second native test target, and is easy to
run locally and later in CI.

Build/install the bare React Native example first, then run:

```bash
pnpm test:e2e:mobile
```

The flow covers shell startup, chrome hide/reveal, page jump, search opening,
and critical safe-area-visible surfaces. It does not assert pixel positions or
clipboard contents. Clipboard remains covered by the unit/integration handler
tests because reliable system-clipboard assertions require a device-specific
Maestro setup.
