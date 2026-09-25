# NixOS module for LIVI.
#
# Covers the whole surface the head unit needs: the package itself, the host
# tools for its own Wi-Fi access point, the udev rule that grants access to a
# phone in Android Auto accessory mode, WirePlumber for audio, and LIVI's
# config.json — which LIVI rewrites at runtime, so it is merged at activation
# rather than symlinked.
{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.programs.livi;
  inherit (lib)
    mkIf
    mkEnableOption
    mkOption
    concatMapStringsSep
    ;

  # Upstream's udev template (assets/linux/99-LIVI.rules.template, mirrored in
  # files/ for eval-time rendering). Adapted for NixOS: the owner lines become
  # group + uaccess, and the two absolute Debian paths point into the store.
  ruleText =
    builtins.replaceStrings
      [
        ''MODE="0660", OWNER="__USERNAME__"''
        "/usr/local/lib/livi/livi-touch-filter"
        "/sbin/sysctl"
      ]
      [
        ''MODE="0660", GROUP="${cfg.usbRules.group}", TAG+="uaccess"''
        "${cfg.package}/lib/livi/resources/livi-touch-filter"
        "${pkgs.procps}/bin/sysctl"
      ]
      (builtins.readFile ./files/99-LIVI.rules.template);

  # LIVI's DEFAULT_BINDINGS (src/main/shared/types/Config.ts, v8.2.1). Spelled
  # out so a declared config is complete: a config.json that only carries the
  # changed keys would otherwise fall back to whatever the app decides.
  defaultBindings = {
    # D-Pad
    up = "ArrowUp";
    down = "ArrowDown";
    left = "ArrowLeft";
    right = "ArrowRight";
    selectUp = "";
    selectDown = "Enter";
    back = "Backspace";

    # Rotary knob
    knobLeft = "";
    knobRight = "";
    knobUp = "";
    knobDown = "";

    # Media
    home = "KeyH";
    cycleSession = "KeyS";
    playPause = "KeyP";
    play = "";
    pause = "";
    next = "KeyN";
    prev = "KeyB";

    # Phone
    acceptPhone = "KeyA";
    rejectPhone = "KeyR";
    phoneKey0 = "Digit0";
    phoneKey1 = "Digit1";
    phoneKey2 = "Digit2";
    phoneKey3 = "Digit3";
    phoneKey4 = "Digit4";
    phoneKey5 = "Digit5";
    phoneKey6 = "Digit6";
    phoneKey7 = "Digit7";
    phoneKey8 = "Digit8";
    phoneKey9 = "Digit9";
    phoneKeyStar = "";
    phoneKeyHash = "";
    phoneKeyHookSwitch = "";

    # Voice
    voiceAssistant = "KeyV";
    voiceAssistantRelease = "";
  };

  # Bindings are typed separately from `settings` because they are the fiddly
  # part; they always win over a raw `settings.bindings`.
  mergedSettings = cfg.settings // {
    bindings = defaultBindings // cfg.bindings;
  };

  settingsFile = (pkgs.formats.json { }).generate "livi-config.json" mergedSettings;

  mergeConfig = pkgs.writeShellScript "livi-config" ''
    set -eu
    export PATH=${lib.makeBinPath [ pkgs.coreutils pkgs.jq ]}:$PATH

    cfg="$1"
    wanted="$2"

    mkdir -p "$(dirname "$cfg")"
    tmp="$(mktemp)"
    trap 'rm -f "$tmp"' EXIT

    if [ -f "$cfg" ]; then
      # Recursive merge: everything LIVI wrote itself (device history, window
      # bounds, dismissed dialogs) survives, the declared keys win.
      jq --slurpfile want "$wanted" '. * $want[0]' "$cfg" > "$tmp"
    else
      cp -f "$wanted" "$tmp"
    fi

    install -m 600 "$tmp" "$cfg"
  '';
in
{
  options.programs.livi = {
    enable = mkEnableOption "LIVI CarPlay/Android Auto head unit";

    package = mkOption {
      type = lib.types.package;
      default = pkgs.livi;
      defaultText = lib.literalExpression "pkgs.livi";
      description = ''
        The LIVI package to use. The flake's `nixosModules.default` sets this to
        its own build for the current system; override to build another release:

        ```nix
        programs.livi.package = pkgs.callPackage kube-livi/package.nix {
          version = "8.3.0"; pnpmDepsHash = "…";
        };
        ```
      '';
    };

    users = mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ ];
      example = [ "kyle" ];
      description = ''
        Users to write {file}`~/.config/LIVI/config.json` for. The file is a
        runtime file — LIVI rewrites it as settings change and restores it from
        its own mirror at {file}`~/.local/share/LIVI/config.json` — so the
        declared keys are merged into it at every activation instead of being
        symlinked. Leave empty to keep your hands off the file.
      '';
    };

    settings = mkOption {
      type = lib.types.attrsOf lib.types.anything;
      default = { };
      example = lib.literalExpression ''
        {
          appearanceMode = "night";   # Phone Appearance: "auto" | "day" | "night"
          nightMode = true;
          darkMode = true;
          carName = "Head unit";
          projectionWidth = 1280;
        }
      '';
      description = ''
        Keys written verbatim into LIVI's config.json — the full surface, see
        `src/main/shared/types/Config.ts` upstream (`DefaultConfig.ts` for the
        defaults). Notable ones: `appearanceMode` is the Phone Appearance
        setting, where `"auto"` sends no day/night override at all and
        `"night"`/`"day"` pin the phone's UI over the session; `nightMode` is
        the value the telemetry adapters push; `darkMode` is LIVI's own UI.
      '';
    };

    bindings = mkOption {
      type = lib.types.attrsOf lib.types.str;
      default = { };
      example = lib.literalExpression ''
        {
          next = "KeyN";
          prev = "KeyB";
          playPause = "KeyP";
        }
      '';
      description = ''
        Keyboard bindings merged over LIVI's defaults. Values are DOM
        `KeyboardEvent.code` names (`KeyH`, `Digit3`, `ArrowUp`, `Enter`, …);
        an empty string unbinds. The keys are LIVI's command names: `up`,
        `down`, `left`, `right`, `selectUp`, `selectDown`, `back`,
        `knobLeft`/`knobRight`/`knobUp`/`knobDown`, `home`, `cycleSession`,
        `playPause`, `play`, `pause`, `next`, `prev`, `acceptPhone`,
        `rejectPhone`, `phoneKey0`…`phoneKey9`, `phoneKeyStar`, `phoneKeyHash`,
        `phoneKeyHookSwitch`, `voiceAssistant`, `voiceAssistantRelease`.

        These bind physical keys to commands the head unit sends to the phone;
        they cannot produce text — Android Auto's input channel carries no
        printable keycodes.
      '';
    };

    wirelessApTools = mkOption {
      type = lib.types.bool;
      default = true;
      description = ''
        Install `hostapd`, `dnsmasq` and `iw`, the tools LIVI drives for its own
        Wi-Fi access point (wireless CarPlay / Android Auto).
      '';
    };

    usbRules = {
      enable = mkOption {
        type = lib.types.bool;
        default = true;
        description = "Install the udev rule for phones in Android Auto accessory mode.";
      };

      group = mkOption {
        type = lib.types.str;
        default = "users";
        description = ''
          Group granted read/write on the phone's USB node. Must exist — NixOS
          has no `plugdev`, so the default is `users`; the rule also tags the
          node with `uaccess`, which covers a logged-in session either way.
          Users of the head unit should be in this group.
        '';
      };
    };

    wireplumber = mkOption {
      type = lib.types.bool;
      default = true;
      description = "Enable WirePlumber, which LIVI expects for audio routing.";
    };

    extraPackages = mkOption {
      type = lib.types.listOf lib.types.package;
      default = [ ];
      example = lib.literalExpression "with pkgs; [ usb-modeswitch ]";
      description = "Extra packages to install on the host alongside LIVI.";
    };
  };

  config = mkIf cfg.enable {
    # packages.txt satisfiers for the in-app "Missing Packages" check. Its
    # probes are capability-based (binary on PATH / module importable); these
    # are the NixOS providers. The lite tools cover a host without a desktop
    # session — every NixOS host, by the app's own heuristic.
    environment.systemPackages =
      [ cfg.package ]
      ++ lib.optionals cfg.wirelessApTools [
        pkgs.hostapd
        pkgs.dnsmasq
        pkgs.iw
      ]
      ++ [
        pkgs.bluez # bluetoothctl
        pkgs.util-linux # rfkill
        pkgs.pulseaudio # pactl
        pkgs.avahi # avahi-daemon
        pkgs.cage # kiosk compositor
        pkgs.seatd # seat management
        pkgs.wlr-randr # display configuration
        pkgs.xdg-user-dirs # xdg-user-dir
        pkgs.curl
        # The helper's python modules (py: probes run `python3 -c import …`).
        (pkgs.python3.withPackages (
          ps: with ps; [
            dbus-python
            pygobject3
            smbus2
            pip
          ]
        ))
      ]
      ++ cfg.extraPackages;

    services.pipewire.wireplumber.enable = mkIf cfg.wireplumber true;

    # The in-app USB check looks for /etc/udev/rules.d/99-LIVI.rules carrying
    # the template's LIVI-RULE-VERSION marker. NixOS owns that directory as one
    # symlinked farm (services.udev collects «pkg»/{etc,lib}/udev/rules.d/* by
    # filename and restarts udevd when it changes), so the rule joins it as a
    # udev package — an environment.etc file under that path cannot be created.
    # If an upstream bump changes the marker, the app asks to update; sync
    # files/99-LIVI.rules.template then.
    services.udev.packages = lib.mkIf cfg.usbRules.enable [
      (pkgs.writeTextDir "lib/udev/rules.d/99-LIVI.rules" ruleText)
    ];

    system.activationScripts.livi-config = mkIf (cfg.users != [ ]) {
      deps = [ "users" ];
      text = concatMapStringsSep "\n" (
        user:
        let
          home = config.users.users.${user}.home;
        in
        ''${pkgs.util-linux}/bin/runuser -u ${user} -- ${mergeConfig} ${home}/.config/LIVI/config.json ${settingsFile}''
      ) cfg.users;
    };
  };
}
