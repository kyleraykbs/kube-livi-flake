# kube-livi

LIVI — a CarPlay & Android Auto head unit — packaged for NixOS: a flake build
plus a NixOS module. The LIVI sources are vendored in [`src/`](src/), a fork of
[f-io/LIVI](https://github.com/f-io/LIVI) v8.2.1, so every change lives
directly in the tree instead of in a patch stack.

## Features

A rolling list — append as things land:

- **CarPlay & Android Auto head unit** — wired and wireless projection,
  multi-session, touch/D-Pad/hard-key input, nested Wayland compositor.
- **Physical-keyboard typing into the phone** — letters, digits and
  punctuation are sent to the phone as Android key events over the AA input
  channel; the printable keycodes are advertised in service discovery so the
  phone accepts them.
- **Text mode** (default on) — while the phone streams, every printable key
  types, even keys bound to commands; commands stay on the non-printable keys
  (arrows, Enter, Escape). Toggle in *Settings → Key Bindings*.
- **Software video decode anywhere** — h264/h265/aac decode via the bundled
  GStreamer tree, completed with the host libraries it was missing (notably
  libssh, without which the bundled libav-based plugin never loads). No
  VA-API/VideoToolbox needed.
- **NixOS module** — the system side: package, udev USB rules, WirePlumber,
  wireless AP tooling (`hostapd`/`dnsmasq`/`iw`), the tools its in-app package
  checks look for.
- **home-manager module** — the per-user side: declarative `config.json`
  (`settings`, `bindings`) merged into the live file at every activation, since
  LIVI rewrites that file at runtime.
- **Built from source** — app packed as asar on nixpkgs' Electron, native
  addons rebuilt against Electron headers, wlroots 0.20 compositor built
  static from the pinned release tarball. First-class on `x86_64-linux` and
  `aarch64-linux`.

## Usage

```nix
# flake.nix
inputs.kube-livi.url = "github:kyleraykbs/kube-livi-flake";
```

```nix
# host configuration
{ inputs, ... }:
{
  imports = [ inputs.kube-livi.nixosModules.default ];

  programs.livi = {
    enable = true; # package, udev rule, WirePlumber, AP tools
  };
}
```

```nix
# home-manager configuration (per user)
{ inputs, ... }:
{
  imports = [ inputs.kube-livi.homeModules.default ];

  programs.livi = {
    enable = true;
    settings = {
      appearanceMode = "night"; # "auto" | "day" | "night"
      nightMode = true;
      darkMode = true;
    };
  };
}
```

## Documentation

- [docs/flake.md](docs/flake.md) — flake outputs, module options, the
  `config.json` surface, and how the pins work.

## Development

```sh
nix build .#livi            # build for the host
```

`src/` is the fork; edit it directly. Dependency pins live in
[`sources.nix`](sources.nix) — see [docs/flake.md](docs/flake.md#pins).

## License

GPL-3.0, same as [upstream LIVI](https://github.com/f-io/LIVI). The vendored
tree in `src/` carries upstream's `LICENSE`.
