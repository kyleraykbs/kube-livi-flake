# home-manager module for LIVI: the per-user half.
#
# LIVI's config.json is a runtime file — the app rewrites it as settings change
# and restores it from its own mirror in ~/.local/share/LIVI — so it is merged
# at activation rather than symlinked. The system side (package, udev, audio,
# AP tools) lives in module.nix.
#
# When stylix is part of the same home configuration it is followed: a dark
# scheme means night + dark mode and the palette's accent/background colours,
# a light scheme the day/light side of the same keys. Declared settings always
# win over what is derived here.
{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.programs.livi;
  shared = import ./shared.nix { inherit lib pkgs; };

  settingsFile = shared.mkSettingsFile (
    shared.mkMergedSettings {
      inherit (cfg) settings bindings;
    }
  );

  # --- stylix ---------------------------------------------------------------
  # Guarded with `or` throughout: neither stylix nor its lib has to be part of
  # the configuration at all.
  stylixColors = config.lib.stylix.colors or { };
  stylixPalette = stylixColors.withHashtag or { };
  stylixOn = (config.stylix.enable or false) && stylixPalette ? base00;

  # Which side of LIVI's theme to use. `stylix.polarity` is not enough: it
  # defaults to "dark" and is not derived from the scheme, so a light scheme
  # with no explicit polarity would paint the dark side. base00's luminance is
  # read instead — in base16 it is the scheme's own background — falling back
  # to polarity only if stylix does not expose the rgb components.
  luminance =
    base:
    let
      byte =
        key:
        lib.toInt (stylixColors."${base}-rgb-${key}" or "0");
    in
    (0.2126 * byte "r" + 0.7152 * byte "g" + 0.0722 * byte "b") / 255.0;

  stylixDark =
    if stylixColors ? "base00-rgb-r" then
      luminance "base00" < 0.5
    else
      (config.stylix.polarity or "dark") != "light";
  stylixVariant = if stylixDark then "Dark" else "Light";

  # base16 slots: base0D is the accent stylix's own targets use as primary,
  # base0E the secondary, base00 the scheme background. LIVI keeps a Light and
  # a Dark value for each and picks by `darkMode`, so only the side matching
  # the scheme's polarity is set.
  stylixSettings = lib.optionalAttrs stylixOn (
    {
      appearanceMode = if stylixDark then "night" else "day";
      nightMode = stylixDark;
      darkMode = stylixDark;
    }
    // lib.optionalAttrs (stylixPalette ? base0D) {
      "primaryColor${stylixVariant}" = stylixPalette.base0D;
    }
    // lib.optionalAttrs (stylixPalette ? base0E) {
      "highlightColor${stylixVariant}" = stylixPalette.base0E;
    }
    // lib.optionalAttrs (stylixPalette ? base00) {
      "backgroundColor${stylixVariant}" = stylixPalette.base00;
    }
  );
in
{
  options.programs.livi = {
    enable = lib.mkEnableOption "LIVI per-user configuration";

    settings = lib.mkOption {
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
        `src/main/shared/types/Config.ts` in the vendored `src/` tree
        (`DefaultConfig.ts` for the defaults). Notable ones: `appearanceMode` is
        the Phone Appearance setting, where `"auto"` sends no day/night override
        at all and `"night"`/`"day"` pin the phone's UI over the session;
        `nightMode` is the value the telemetry adapters push; `darkMode` is
        LIVI's own UI; `textMode` is physical-keyboard typing.

        When stylix is enabled in this home configuration, `appearanceMode`,
        `nightMode`, `darkMode` and the `primaryColor*`/`highlightColor*`/
        `backgroundColor*` pair matching the scheme's polarity default to the
        scheme. Setting any of them here overrides that.
      '';
    };

    bindings = lib.mkOption {
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
  };

  config = lib.mkIf cfg.enable {
    # mkDefault per key, so a value declared in `settings` wins.
    programs.livi.settings = lib.mapAttrs (_: lib.mkDefault) stylixSettings;

    # Runs as the user, so the file lands with the right ownership; `run` is
    # home-manager's dry-run wrapper.
    home.activation.liviConfig = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
      run ${shared.mkMergeScript} ${config.home.homeDirectory}/.config/LIVI/config.json ${settingsFile}
    '';
  };
}
