# LIVI, wrapped for NixOS.
#
# Upstream ships an AppImage that carries its own Electron build and its own
# GStreamer under resources/gstreamer/linux-<arch>/. `wrapType2` puts that
# AppImage in an FHS environment, which is where the interesting part lives:
# the bundled GStreamer is patched to `$ORIGIN` rpaths, so every library its
# plugins link has to be resolvable from that environment's /usr/lib64 —
# and buildFHSEnv only exposes the outputs of the packages listed in
# targetPkgs/multiPkgs/extraPkgs (includeClosures defaults to false).
#
# One of those dependencies is libssh.so.4, pulled in by the bundled
# libavformat. Without it libgstlibav.so never loads, so the software decoders
# (avdec_h264/avdec_h265/avdec_aac) never register and LIVI reports
# "no decoder registered for h264" the moment a phone connects. The deps below
# are the full set the shipped plugins need; the profile forced in the sandbox
# makes the outcome independent of how that environment resolves libraries.
{
  lib,
  pkgs,
  appimageTools,
  fetchurl,
  version,
  url,
  hash,
  # Extra shell appended to the sandbox's /etc/profile.
  extraProfile ? "",
}:

let
  # Host libraries the bundled GStreamer plugins link (DT_NEEDED closure of
  # every file in resources/gstreamer/linux-<arch>/).
  bundleDeps =
    p:
    with p;
    [
      libgudev
      libssh
      libv4l
      libva
      pulseaudio
      python3Packages.dbus-python
      python3Packages.pygobject3
      zstd
      elfutils
    ];

  # `gst-host` is three levels down from the bundled GStreamer, and its
  # dependency on libssh is not something the app can fix itself; preloading the
  # library satisfies the plugin's DT_NEEDED from the already-loaded object.
  # LIVI_GST_PRELOAD is LIVI's own knob for the decoder child (gstHost.ts), and
  # plain LD_PRELOAD additionally covers the `--probe` child, which the knob
  # does not touch — the probe is what decides which codecs get advertised.
  profile = ''
    # The appimage's generated profile exports the nix GStreamer plugin
    # directory as GST_PLUGIN_SYSTEM_PATH_1_0, and that versioned variable
    # outranks the GST_PLUGIN_SYSTEM_PATH="" LIVI sets for its decoder host, so
    # the bundle would share a plugin path with a second, foreign GStreamer
    # build. LIVI's own bundle is the intended one here.
    unset GST_PLUGIN_SYSTEM_PATH_1_0
    # Private registry, deleted on every start: one written while the libav
    # plugin was unloadable must never be reused.
    export GST_REGISTRY=/tmp/livi-gst-registry.bin
    rm -f "$GST_REGISTRY"
    export LIVI_GST_PRELOAD=${pkgs.libssh}/lib/libssh.so.4
    export LD_PRELOAD=${pkgs.libssh}/lib/libssh.so.4
    ${extraProfile}
  '';
in
appimageTools.wrapType2 {
  pname = "livi";
  inherit version profile;

  src = fetchurl {
    inherit url hash;
  };

  extraPkgs = bundleDeps;

  meta = {
    description = "CarPlay and Android Auto head unit";
    longDescription = ''
      Native CarPlay & Android Auto head unit: wired and wireless projection,
      GStreamer video pipeline, touch/D-Pad/hard-key input, multi-session.
      Packaged from the upstream AppImage.
    '';
    homepage = "https://github.com/f-io/LIVI";
    license = lib.licenses.gpl3Only;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
    ];
    mainProgram = "livi";
  };
}
