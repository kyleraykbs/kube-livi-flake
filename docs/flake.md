# Flake & module reference

## Outputs

| Output | What it is |
| --- | --- |
| `packages.<system>.livi` / `default` | The LIVI build: Electron app (packed asar), bundled GStreamer decode tree, static wlroots compositor |
| `overlays.default` | Adds `pkgs.livi` |
| `nixosModules.default` / `nixosModules.livi` | The NixOS module; also sets `programs.livi.package` to this flake's build |
| `formatter.<system>` | `nixfmt` |

Systems: `x86_64-linux`, `aarch64-linux`. Both build natively; cross-compiling
is not supported (native addons and the compositor build for the host).

## Module options (`programs.livi`)

| Option | Default | Description |
| --- | --- | --- |
| `enable` | `false` | Install LIVI |
| `package` | `pkgs.livi` | The package to run; the flake module points it at its own source build |
| `users` | `[ ]` | Users whose `~/.config/LIVI/config.json` gets the declared keys merged at every activation. The file is a runtime file (LIVI rewrites it and keeps its own mirror in `~/.local/share/LIVI/`), so keys are merged, never symlinked. Empty list = hands off the file |
| `settings` | `{ }` | Keys written verbatim into `config.json` — the whole config surface (see below) |
| `bindings` | `{ }` | Keyboard bindings merged over LIVI's defaults; values are DOM `KeyboardEvent.code` names (`KeyH`, `Digit3`, `ArrowUp`, `Enter`, …), `""` unbinds |
| `wirelessApTools` | `true` | Install `hostapd`, `dnsmasq`, `iw` for LIVI's Wi-Fi access point (wireless CarPlay / Android Auto) |
| `usbRules.enable` | `true` | udev rule for phones in Android Auto accessory mode |
| `usbRules.group` | `"users"` | Group granted the phone's USB node (NixOS has no `plugdev`; the rule also tags `uaccess`) |
| `wireplumber` | `true` | Enable WirePlumber, which LIVI expects for audio routing |
| `extraPackages` | `[ ]` | Extra packages installed alongside LIVI |

## Config surface (`settings`)

Freeform: every key lands in `config.json` as-is. The full schema and defaults
live in the fork's
[`src/main/shared/types/Config.ts`](../src/src/main/shared/types/Config.ts)
and
[`src/main/shared/types/DefaultConfig.ts`](../src/src/main/shared/types/DefaultConfig.ts).
Notable keys:

- `appearanceMode` — phone appearance: `"auto"` sends no override, `"day"` /
  `"night"` pin the phone's UI
- `nightMode` — the value telemetry adapters push to the phone
- `darkMode` — LIVI's own UI theme
- `projectionWidth` / `projectionHeight` — negotiated projection resolution
- `textMode` — physical-keyboard typing into the phone while streaming
  (default `true`; also toggleable in *Settings → Key Bindings*)

`bindings` keys: `up`, `down`, `left`, `right`, `selectUp`, `selectDown`,
`back`, `knobLeft`, `knobRight`, `knobUp`, `knobDown`, `home`, `cycleSession`,
`play`, `pause`, `playPause`, `next`, `prev`, `acceptPhone`, `rejectPhone`,
`phoneKey0`–`phoneKey9`, `phoneKeyStar`, `phoneKeyHash`, `phoneKeyHookSwitch`,
`voiceAssistant`, `voiceAssistantRelease`.

Defaults matter for typing: LIVI binds `KeyH` (home), `KeyS` (cycle session),
`KeyP` (play/pause), `KeyN`/`KeyB` (next/prev), `KeyA`/`KeyR` (accept/reject
call), `Enter`, `Backspace`, and the digit keys (phone dial pad). With
`textMode` on, printable keys type regardless.

## Pins

[`sources.nix`](../sources.nix):

- `version` — the LIVI version the fork tracks
- `pnpmDepsHash` — the pnpm store fixed-output hash. Set it to `""`, build,
  and paste back the `got:` hash when the lockfile changes

There is no source tarball hash: the sources are the vendored `src/` tree.

## Building

```sh
nix build .#livi            # the package, for the host
nix flake show              # outputs
```

The derivation assembles the Electron app directory by hand (asar + unpacked
native modules + the GStreamer decode tree + the compositor + the python
driver tree) instead of running electron-builder; the layout contract is
documented at the top of [`package.nix`](../package.nix).
