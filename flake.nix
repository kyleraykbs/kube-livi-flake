{
  description = "LIVI (CarPlay / Android Auto head unit) packaged for NixOS";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
  };

  outputs =
    inputs@{ flake-parts, ... }:
    let
      sources = import ./sources.nix;

      # One package, pinned to the release in sources.nix. Pass different
      # version/url/hash through pkgs.callPackage to build another one.
      packageFor =
        pkgs:
        pkgs.callPackage ./package.nix {
          inherit (sources) version;
          url = sources.urlFor pkgs.stdenv.hostPlatform.system;
          hash = sources.assets.${pkgs.stdenv.hostPlatform.system}.hash;
        };
    in
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];

      flake = {
        # `pkgs.livi` for people who prefer overlays.
        overlays.default = final: _prev: {
          livi = packageFor final;
        };

        nixosModules.default =
          {
            lib,
            pkgs,
            ...
          }:
          {
            imports = [ ./module.nix ];
            # The AppImage is per-architecture, so the default package is built
            # for the host being configured.
            programs.livi.package = lib.mkDefault (packageFor pkgs);
          };

        # Alias, so both `nixosModules.default` and `nixosModules.livi` work.
        nixosModules.livi = inputs.self.nixosModules.default;
      };

      perSystem =
        { pkgs, ... }:
        {
          packages.livi = packageFor pkgs;
          packages.default = packageFor pkgs;
          formatter = pkgs.nixfmt;
        };
    };
}
