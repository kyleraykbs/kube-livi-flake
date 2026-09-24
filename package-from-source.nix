# LIVI built from source, for NixOS.
#
# Why from source: the AA typing patch (patches/0001-aa-typing-keys.patch)
# changes runtime logic and the shipped app.asar is minified — a prebuilt
# AppImage can be wrapped but not patched. This derivation builds the app with
# the patch applied and assembles the Electron app directory by hand instead of
# running electron-builder.
#
# Runtime layout contract (reverse-engineered from v8.2.1; RES =
# process.resourcesPath = <appDir>/resources, ASAR = app.getAppPath()):
#
#   <RES>/app.asar                      vite output (out/) minus out/main/driver
#                                       and out/compositor, plus package.json
#                                       and a *flat* node_modules (prod closure)
#   <RES>/app.asar.unpacked/node_modules/{usb,gst-video,livi-crypto,@node-usb}
#   <RES>/app.asar.unpacked/node_modules/gst-video/build/Release/livi-gst-host
#       gstHost.ts derives this path with require.resolve('gst-video') and a
#       literal 'app.asar' -> 'app.asar.unpacked' string replacement, so the
#       flat layout and the unpack globs are load-bearing, not cosmetic.
#   <RES>/gstreamer/linux-<arch>/       committed decoder bundle (in-tree, no
#                                       LFS) — same bytes the AppImage ships
#   <RES>/compositor/livi-compositor    launcher; missing file silently
#                                       disables the nested compositor
#   <RES>/driver/{helper,shared,bt,cp/iap2}  python driver tree
#   <RES>/{packages.txt,displays,99-LIVI.rules.template,
#          99-LIVI-bt.sudoers.template,livi-touch-filter,setup-hdmi-pr-display.sh}
#
# The decoder children (livi-gst-host, gst-launch-1.0, gst-device-monitor-1.0)
# are spawned with LD_LIBRARY_PATH=<bundle>/lib REPLACING the inherited value,
# so anything the bundled plugins link but the bundle does not carry has to
# live inside the bundle's lib dir. That set is libssh (the bundled libavformat
# needs it — without it libgstlibav.so does not load and every h26x/aac decode
# fails), libgudev, libv4l, libva, pulseaudio, zstd and elfutils. They are
# copied in at assembly; the copies keep their nix RUNPATHs, so their own
# dependencies resolve from the store. No LD_PRELOAD belt needed.
#
# Both x86_64-linux and aarch64-linux are first-class: node-gyp's --arch and
# the bundle directory name are derived from hostPlatform, and the pnpm store
# fetch is arch-independent between linux builders (the lockfile pins
# supportedArchitectures to os=current+darwin, cpu=current+x64+arm64), so one
# pnpmDeps hash serves both systems. Cross-compilation is not supported — the
# native addons and the compositor build for the host.
{
  lib,
  stdenv,
  fetchFromGitHub,
  fetchurl,
  fetchPnpmDeps,
  pnpmConfigHook,
  writableTmpDirAsHomeHook,
  writeShellScript,
  pnpm_11,
  nodejs,
  node-gyp,
  electron_43,
  asar,
  python3,
  python3Packages,
  pkg-config,
  meson,
  ninja,
  # Bundled GStreamer build-time linkage (native/gst-video + livi-gst-host
  # link whatever pkg-config finds; the bundled 1.28.x is ABI-compatible).
  gst_all_1,
  # livi-compositor + the wlroots-0.20 subproject.
  wayland,
  wayland-scanner,
  wayland-protocols,
  libxkbcommon,
  pixman,
  cairo,
  libdrm,
  libglvnd,
  libgbm,
  mesa,
  # Copied into the bundle's lib dir at assembly (see header).
  libssh,
  libgudev,
  libv4l,
  libva,
  pulseaudio,
  zstd,
  elfutils,
  version ? "8.2.1",
  srcHash ? "sha256-9H17QoSleIJ/WWSFujz6HGdVuF90mxXovyXIxXkrPps=",
  pnpmDepsHash ? "sha256-iRMCkqs6RFBhjbntf8ulwsajkN8JDf/NmbIeYtBI6T4=",
}:

let
  # node-gyp arch name and the committed bundle dir name, per target system.
  arch =
    {
      x86_64-linux = {
        gyp = "x64";
        bundle = "linux-x64";
      };
      aarch64-linux = {
        gyp = "arm64";
        bundle = "linux-arm64";
      };
    }
    .${stdenv.hostPlatform.system} or (throw "kube-livi: unsupported system ${stdenv.hostPlatform.system}");

  # The app's devDependency pin (pnpm-lock.yaml: electron@43.4.0). The runtime
  # is nixpkgs' electron_43 (same major); the addons only need the headers'
  # node_api.h — both targets are N-API, so the ABI is stable either way.
  electronVersion = "43.4.0";
  electronHeaders = fetchurl {
    url = "https://artifacts.electronjs.org/headers/dist/v${electronVersion}/node-v${electronVersion}-headers.tar.gz";
    hash = "sha256-Lwxw6xhIcjMGQuae82I5KTBjjRQ+B59HUyA0Ui1ruc4=";
  };

  # Upstream's wrap-git pins the `0.20` branch, which currently points at the
  # 0.20.2 release. The released tarball is reproducible; the branch is not.
  wlrootsVersion = "0.20.2";
  wlrootsSrc = fetchurl {
    url = "https://gitlab.freedesktop.org/wlroots/wlroots/-/archive/${wlrootsVersion}/wlroots-${wlrootsVersion}.tar.gz";
    hash = "sha256-lyx6xEsXgo9HAr+ufNg0c0aj+1ssEHbPosP87axew0M=";
  };

  # Libraries the bundled GStreamer plugins link but the bundle lacks.
  bundleLibs = map lib.getLib [
    libssh
    libgudev
    libv4l
    libva
    pulseaudio
    zstd
    elfutils
  ];

  # The python driver helper is started as `sudo -n -E python3` and imports
  # GLib/DBus bindings; give it a python that has them.
  helperPython = python3.withPackages (
    ps: with ps; [
      pygobject3
      dbus-python
    ]
  );

  liviWrapper = writeShellScript "livi" ''
    export PATH=${helperPython}/bin:$PATH
    exec ${electron_43}/bin/electron ${placeholder "out"}/lib/livi/resources/app.asar "$@"
  '';
in
stdenv.mkDerivation {
  pname = "livi";
  inherit version;

  src = fetchFromGitHub {
    owner = "f-io";
    repo = "LIVI";
    rev = "v${version}";
    hash = srcHash;
  };

  patches = [ ./patches/0001-aa-typing-keys.patch ];

  # meson/ninja are used explicitly in buildPhase for the compositor subproject;
  # the root of the tree is not a meson project, so the meson hook must not
  # claim the phases.
  dontUseMesonConfigure = true;
  dontUseNinjaBuild = true;
  dontUseNinjaInstall = true;

  pnpmDeps = fetchPnpmDeps {
    pname = "livi";
    inherit version;
    src = fetchFromGitHub {
      owner = "f-io";
      repo = "LIVI";
      rev = "v${version}";
      hash = srcHash;
    };
    fetcherVersion = 4;
    pnpm = pnpm_11;
    hash = pnpmDepsHash;
  };

  nativeBuildInputs = [
    nodejs
    pnpm_11
    pnpmConfigHook
    writableTmpDirAsHomeHook
    node-gyp
    python3
    pkg-config
    wayland-scanner
    meson
    ninja
    asar
  ];

  buildInputs = [
    gst_all_1.gstreamer
    gst_all_1.gst-plugins-base
    wayland
    wayland-protocols
    libxkbcommon
    pixman
    cairo
    libdrm
    libglvnd
    libgbm
    mesa
  ]
  ++ bundleLibs;

  # pnpm's isolated linker would leave node_modules/<pkg> as symlinks into
  # .pnpm; the shipped app carries a flat tree and gstHost.ts' app.asar ->
  # app.asar.unpacked rewrite only resolves correctly with one. Hoisting also
  # matches what electron-builder packs.
  postPatch = ''
    echo 'node-linker=hoisted' >> .npmrc

    # The root postinstall (`electron-builder install-app-deps`) is a dev-time
    # rebuild step; the natives are built explicitly against the app's Electron
    # headers in buildPhase. `prepare` is husky. Dropping both keeps any pnpm
    # invocation (prune re-runs lifecycle scripts) from clobbering them.
    npm pkg delete scripts.postinstall scripts.prepare

    # Upstream forces the pinned wlroots subproject from a wrap-git; build the
    # same subproject from the released tarball offline, with LIVI's two
    # patches applied, and let meson find it pre-extracted.
    sub=native/livi-compositor/subprojects
    mkdir -p $sub/packagecache
    cp ${wlrootsSrc} $sub/packagecache/wlroots-${wlrootsVersion}.tar.gz
    tar -xf ${wlrootsSrc} -C $sub
    for diff in "$PWD"/$sub/packagefiles/*.patch; do
      patch -d $sub/wlroots-${wlrootsVersion} -p1 -i "$diff"
    done
    cat > $sub/wlroots.wrap <<'EOF'
[wrap-file]
directory = wlroots-0.20.2
source_filename = wlroots-0.20.2.tar.gz
source_url = https://gitlab.freedesktop.org/wlroots/wlroots/-/archive/0.20.2/wlroots-0.20.2.tar.gz
source_hash = 972c7ac44b17828f4702bfae7cd8347346a3fb5b2c1076cfa2c3fcedac5ec343

[provide]
dependency_names = wlroots-0.20
wlroots-0.20 = wlroots
EOF
  '';

  buildPhase = ''
    runHook preBuild

    # Native addons against the app's exact Electron headers.
    mkdir -p .electron-headers
    tar -xf ${electronHeaders} -C .electron-headers --strip-components=1
    for native in gst-video crypto; do
      pushd native/$native
      node-gyp rebuild --arch=${arch.gyp} --nodedir="$PWD/../../.electron-headers"
      popd
    done

    # Main/preload/renderer bundle.
    pnpm run build:app

    # Nested wlroots compositor. force-fallback-for pins the patched
    # subproject even where a system wlroots exists; the subproject carries
    # LIVI's host-output-control patch, so it must always build.
    meson setup native/livi-compositor/build native/livi-compositor \
      --buildtype=release \
      --force-fallback-for=wlroots-0.20
    ninja -C native/livi-compositor/build

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    # App tree for asar: prod-only flat node_modules, same exclusions as
    # electron-builder.yml's `files` list. No scripts: the workspace addons
    # carry implicit node-gyp install scripts that would rebuild the natives
    # against the wrong headers.
    pnpm prune --prod --ignore-scripts

    mkdir -p app
    cp package.json app/
    cp -rL out app/out
    rm -rf app/out/compositor app/out/main/driver
    cp -rL node_modules app/node_modules

    R=$out/lib/livi/resources
    mkdir -p $R
    # @electron/asar matches --unpack globs against the absolute crawl path,
    # so the pattern has to be **-anchored.
    asar pack app $R/app.asar \
      --unpack '**/node_modules/{usb,gst-video,livi-crypto,@node-usb}/**'

    # Committed decoder bundle for this arch, plus the plugin deps it lacks.
    mkdir -p $R/gstreamer
    cp -r assets/gstreamer/${arch.bundle} $R/gstreamer/${arch.bundle}
    rm -f $R/gstreamer/${arch.bundle}/lib/*.a
    rm -rf $R/gstreamer/${arch.bundle}/share
    for dep in ${toString bundleLibs}; do
      cp -a $dep/lib/*.so* $R/gstreamer/${arch.bundle}/lib/
    done

    # Nested compositor: real binary from the nix build (libs resolve via its
    # RUNPATHs), plus the launcher LIVI execs.
    install -Dm755 native/livi-compositor/build/livi-compositor $out/lib/livi/bin/livi-compositor
    mkdir -p $R/compositor
    cat > $R/compositor/livi-compositor <<EOF
#!/usr/bin/env bash
exec $out/lib/livi/bin/livi-compositor "\$@"
EOF
    chmod +x $R/compositor/livi-compositor

    # Python driver tree (electron-builder.yml linux.extraResources).
    mkdir -p $R/driver/cp
    cp -r src/main/services/projection/driver/cp/iap2 $R/driver/cp/iap2
    cp -r src/main/services/projection/driver/shared $R/driver/shared
    cp -r src/main/services/projection/driver/bt $R/driver/bt
    cp -r src/main/services/projection/driver/helper $R/driver/helper
    find $R/driver -name '*.ts' -delete
    find $R/driver -name '__pycache__' -type d -prune -exec rm -rf {} +
    find $R/driver -name '*.pyc' -delete

    # Resource files read by name from RES at runtime / by install scripts.
    cp scripts/install/packages.txt $R/packages.txt
    cp -r assets/displays $R/displays
    cp assets/linux/99-LIVI.rules.template $R/
    cp assets/linux/99-LIVI-bt.sudoers.template $R/
    install -m 755 assets/linux/livi-touch-filter $R/livi-touch-filter
    cp scripts/install/pi/setup-hdmi-pr-display.sh $R/setup-hdmi-pr-display.sh

    # AppStream metadata lands as a sibling of resources/ upstream.
    mkdir -p $out/lib/livi/share/metainfo
    cp assets/linux/dev.f-io.livi.metainfo.xml $out/lib/livi/share/metainfo/

    # Desktop entry: the AppImage carried one; NixOS installs it from here.
    mkdir -p $out/share/applications $out/share/icons/hicolor/256x256/apps
    cp assets/icons/linux/livi.png $out/share/icons/hicolor/256x256/apps/livi.png
    cat > $out/share/applications/dev.f-io.livi.desktop <<EOF
[Desktop Entry]
Name=LIVI
Comment=CarPlay and Android Auto head unit
Exec=livi
Icon=livi
Type=Application
Categories=Utility;
StartupWMClass=dev.f-io.livi
EOF

    install -Dm755 ${liviWrapper} $out/bin/livi

    runHook postInstall
  '';

  meta = {
    description = "CarPlay and Android Auto head unit";
    longDescription = ''
      Native CarPlay & Android Auto head unit: wired and wireless projection,
      GStreamer video pipeline, touch/D-Pad/hard-key input, multi-session.
      Built from source with the Android Auto typing patch applied.
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
