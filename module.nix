# NixOS module for LIVI: the system side of a head unit host.
#
# Covers the package itself, the host tools for its own Wi-Fi access point, the
# udev rule that grants access to a phone in Android Auto accessory mode,
# WirePlumber for audio, and the tools its in-app "Missing Packages" checks look
# for. LIVI's config.json is per-user and belongs to the home-manager module
# (home.nix) — see shared.nix for the merge itself.
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
  };
}
