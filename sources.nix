# Pins for the fork build. The LIVI sources are vendored in ./src (a fork of
# f-io/LIVI v8.2.1) — no source tarball to hash. To bump pnpmDepsHash: set it
# to "" and fetchPnpmDeps will fail with the "got:" hash to paste back in. It
# is arch-independent between linux builders (the lockfile pins
# supportedArchitectures to os=current+darwin, cpu=current+x64+arm64), so one
# hash serves both systems.
let
  version = "8.2.1";
  pnpmDepsHash = "sha256-iRMCkqs6RFBhjbntf8ulwsajkN8JDf/NmbIeYtBI6T4=";
in
{
  inherit version pnpmDepsHash;
}
