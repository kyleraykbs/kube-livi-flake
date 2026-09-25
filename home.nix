# home-manager module for LIVI: the per-user half.
#
# LIVI's config.json is a runtime file — the app rewrites it as settings change
# and restores it from its own mirror in ~/.local/share/LIVI — so it is merged
# at activation rather than symlinked. The system side (package, udev, audio,
# AP tools) lives in module.nix.
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
    # Runs as the user, so the file lands with the right ownership; `run` is
    # home-manager's dry-run wrapper.
    home.activation.liviConfig = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
      run ${shared.mkMergeScript} ${config.home.homeDirectory}/.config/LIVI/config.json ${settingsFile}
    '';
  };
}
