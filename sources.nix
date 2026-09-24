# Upstream release pins for the from-source build. Bumping `version` means
# re-hashing two fixed-output derivations:
#   srcHash      — the GitHub tag tarball (unpacked tree):
#                  nix-prefetch-url --unpack \
#                    https://github.com/f-io/LIVI/archive/refs/tags/v<version>.tar.gz
#                  | xargs -I{} nix hash convert --hash-algo sha256 --to sri {}
#   pnpmDepsHash — the pnpm store; set it to "" and fetchPnpmDeps will fail
#                  with the "got:" hash to paste back in. It is arch-
#                  independent between linux builders (the lockfile pins
#                  supportedArchitectures to os=current+darwin,
#                  cpu=current+x64+arm64), so one hash serves both systems.
let
  version = "8.2.1";
  srcHash = "sha256-9H17QoSleIJ/WWSFujz6HGdVuF90mxXovyXIxXkrPps=";
  pnpmDepsHash = "sha256-iRMCkqs6RFBhjbntf8ulwsajkN8JDf/NmbIeYtBI6T4=";
in
{
  inherit version srcHash pnpmDepsHash;
}
