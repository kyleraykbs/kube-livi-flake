# Pieces shared by the NixOS module (module.nix) and the home-manager module
# (home.nix): the binding defaults, the merged settings, and the merge script
# that folds them into LIVI's runtime config.json.
{ lib, pkgs }:
rec {
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
  mkMergedSettings =
    { settings, bindings }:
    settings // {
      bindings = defaultBindings // bindings;
    };

  mkSettingsFile = settings: (pkgs.formats.json { }).generate "livi-config.json" settings;

  # Merges the declared keys into the live config.json. LIVI rewrites that file
  # at runtime (and restores it from its own mirror in ~/.local/share/LIVI), so
  # it cannot be a symlink: everything the app wrote itself — device history,
  # window bounds, dismissed dialogs — survives, the declared keys win.
  #
  # Usage: livi-config <config.json> <declared-json>
  mkMergeScript = pkgs.writeShellScript "livi-config" ''
    set -eu
    export PATH=${lib.makeBinPath [ pkgs.coreutils pkgs.jq ]}:$PATH

    cfg="$1"
    wanted="$2"

    mkdir -p "$(dirname "$cfg")"
    tmp="$(mktemp)"
    trap 'rm -f "$tmp"' EXIT

    if [ -f "$cfg" ]; then
      jq --slurpfile want "$wanted" '. * $want[0]' "$cfg" > "$tmp"
    else
      cp -f "$wanted" "$tmp"
    fi

    install -m 600 "$tmp" "$cfg"
  '';
}
