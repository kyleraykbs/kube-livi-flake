# Flake & module reference

Two modules, one per scope:

- **`nixosModules.default`** — the system side: installs the package and the
  host tooling a head unit needs.
- **`homeModules.default`** — the per-user side: LIVI's `config.json`
  (`settings`, `bindings`), merged into the live file at every activation.

## Outputs

| Output | What it is |
| --- | --- |
| `packages.<system>.livi` / `default` | The LIVI build: Electron app (packed asar), bundled GStreamer decode tree, static wlroots compositor |
| `overlays.default` | Adds `pkgs.livi` |
| `nixosModules.default` / `nixosModules.livi` | NixOS module; also sets `programs.livi.package` to this flake's build |
| `homeModules.default` / `homeModules.livi` | home-manager module (aliased as `homeManagerModules`, the name some flakes use) |
| `formatter.<system>` | `nixfmt` |

Systems: `x86_64-linux`, `aarch64-linux`. Both build natively; cross-compiling
is not supported (native addons and the compositor build for the host).

## NixOS module options (`programs.livi`)

| Option | Default | Description |
| --- | --- | --- |
| `enable` | `false` | Install LIVI and the host tooling below |
| `package` | `pkgs.livi` | The package to run; the flake module points it at its own source build |
| `wirelessApTools` | `true` | Install `hostapd`, `dnsmasq`, `iw` for LIVI's Wi-Fi access point (wireless CarPlay / Android Auto) |
| `usbRules.enable` | `true` | udev rule for phones in Android Auto accessory mode |
| `usbRules.group` | `"users"` | Group granted the phone's USB node (NixOS has no `plugdev`; the rule also tags `uaccess`) |
| `wireplumber` | `true` | Enable WirePlumber, which LIVI expects for audio routing |
| `extraPackages` | `[ ]` | Extra packages installed alongside LIVI |

It also installs the tools LIVI's in-app "Missing Packages" check probes for
(`bluez`, `util-linux`, `pulseaudio`, `avahi`, `cage`, `seatd`, `wlr-randr`,
`xdg-user-dirs`, `curl`, a `python3` with the helper's modules).

## home-manager module options (`programs.livi`)

| Option | Default | Description |
| --- | --- | --- |
| `enable` | `false` | Manage this user's `config.json` |
| `settings` | `{ }` | Keys written verbatim into `config.json` — the whole config surface (see below) |
| `bindings` | `{ }` | Keyboard bindings merged over LIVI's defaults; values are DOM `KeyboardEvent.code` names (`KeyH`, `Digit3`, `ArrowUp`, `Enter`, …), `""` unbinds |

`settings` and `bindings` are merged into `~/.config/LIVI/config.json` by a
`home.activation` entry (after `writeBoundary`), **not** symlinked: LIVI
rewrites that file while it runs and keeps its own mirror in
`~/.local/share/LIVI/`, so everything the app wrote itself (device history,
window bounds, dismissed dialogs) survives and the declared keys win.

## Stylix

If stylix is part of the same home configuration, the module reads the scheme
and fills in these keys as *defaults* — declaring any of them under
`programs.livi.settings` overrides just that key:

| Key | Comes from |
| --- | --- |
| `darkMode`, `nightMode`, `appearanceMode` | the scheme's side: a dark background means `true` / `true` / `"night"`, a light one `false` / `false` / `"day"` |
| `backgroundColorDark` or `backgroundColorLight` | `base00` |
| `primaryColorDark` or `primaryColorLight` | `base0D` (the accent stylix's own targets use) |
| `highlightColorDark` or `highlightColorLight` | `base0E` |

Which side is picked is decided by `base00`'s luminance, not by
`stylix.polarity`: polarity defaults to `"dark"` and is not derived from the
scheme, so a light scheme without an explicit polarity would otherwise paint
the dark side. `polarity` is only a fallback for stylix versions that do not
expose the palette's rgb components. LIVI keeps a Light and a Dark value for
each colour and picks by `darkMode`, so only the matching side is set.

With no stylix in the configuration nothing is derived and the keys stay
untouched.

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
- `navWhileStreaming` — keep the nav rail reachable while a phone streams
  (default `true` in this fork): it floats above the projection and auto-hides
  when idle; `false` is upstream's behaviour, where the rail is dropped on the
  projection page. *Settings → Appearance*

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
