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

      # One package, built from the fork in ./src and pinned in sources.nix.
      # Pass different version/pnpmDepsHash through pkgs.callPackage to build
      # another release.
      packageFor =
        pkgs:
        pkgs.callPackage ./package.nix {
          inherit (sources) version pnpmDepsHash;
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
            # Built from source for the host being configured.
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
