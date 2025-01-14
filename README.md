

<!-- toc -->

- [:window: FileStorage UI](#window-filestorage-ui)
  * [Dev Guide](#dev-guide)
  * [Build Guide](#build-guide)
  * [Deploy on-chain](#deploy-on-chain)
- [Features](#features)
  * [UI Components](#ui-components)
- [Contribution](#contribution)
  * [DApp Architecture](#dapp-architecture)
    + [Styling](#styling)
  * [Authorization UX](#authorization-ux)
    + [Implicit Flow](#implicit-flow)
    + [Wallet Flow](#wallet-flow)
      - [Improvement](#improvement)
  * [Codebase: Structure](#codebase-structure)
    + [src/context](#srccontext)
    + [src/pages](#srcpages)
    + [src/components](#srccomponents)
    + [src/partials](#srcpartials)
    + [src/packages](#srcpackages)
    + [src/styles](#srcstyles)
    + [src/config.ts](#srcconfigts)
    + [scripts/*](#scripts)
    + [main.tsx](#maintsx)
    + [polyfill.ts](#polyfillts)
    + [utils.ts](#utilsts)
- [Related Work](#related-work)

<!-- tocstop -->

# :window: FileStorage UI

SKALE Chain File Storage DApp — Browse, navigate, upload and manage files.

![UI Preview](https://staging-v2.skalenodes.com/fs/roasted-thankful-unukalhai/5a4ab05fbb140eb6a51e7d13a528a6aa35a5ef4a/fsui-preview.png)

----

**Build requirements:** Node v16, Git

```
git clone git@github.com:skalenetwork/filestorage-ui.git
```

## Dev Guide

```sh
cp .env.staging .env.local
yarn
yarn dev
```

Start from: `pages/app.tsx` and `context/index.tsx`.

## Build Guide

1. Configure default chain

Default chain can be configured before static build. Copy the existing environment and update variables.

```sh
cp .env.staging .env.production
```

2. Create static build

Static build is by default output in `/dist` directory.

```sh
# output in /dist
yarn install && yarn build
```

3. Ongoing customization

UI can be customized through global presets in `public/presets.js`. Following is its type definition and properties description.

**Note:** Chains can be set in presets. Default is set in env before build. It can be *overridden by the first preset chain with default flag*.

``` typescript
export type ConfigType = {
  optimize: {
    prefetchEvent: string; // placeholder (ignore)
    prefetchDepth: number; // (0, Infinity) directory depth to prefetch during navigation
  };
  branding: {
    logoUrl: string; // URL to logo image
    logoText: string; // Optional text placed next to logo
  };
  navigator: {
    pageLimit: number; // max items per navigator page
  };
  uploader: {
    batchThreshold: number; // max items where upload is marked as batch
    maxFileDirNameLength: number; // max characters count of directory name
  };
  chains: {
    default?: boolean; // option to set as default
    protocol: string; // http or https
    nodeDomain: string; // node host FQDN
    version: string; // chain version
    sChainName: string; // chain name
    chainId: string; // chain ID
  }[]
}
```

## Deploy on-chain

```sh
yarn deploy -a <address> -k <pvtKey> -s <sourcePath> -d <destinationPath> -m <mode>
```

OR

```sh
export SKL_DEPLOYER_ADDRESS=<address>
export SKL_DEPLOYER_PRIVATE_KEY=<pvtKey>
yarn deploy -s <path>
```

OR interactively

```sh
yarn deploy -s <sourcePath> -i
```

Check help for options and defaults.

```sh
yarn deploy --help
```

# Features

## UI Components

- [x] Wallet picker
- [x] Multi-file uploader
- [x] Space reservation 
- [x] Role allocation
- [x] Total usage metrics
- [x] File Navigator: paginated + sortable + actionable
- [x] Navigation breadcrumb
- [x] Address switch
- [x] Search

# Contribution

## DApp Architecture

FileStorage UI builds on top of `filestorage.js`, extending it with `filemanager.tx` and react hooks.

![](https://i.imgur.com/ACfouYg.png)

Read further @ [DeFileManager Package Documentation](https://github.com/skalenetwork/filestorage-ui/blob/main/src/packages/filemanager/README.md).

### Styling

Project uses tailwind class-based styling.

- For those not familiar but seasoned with CSS, you can pick pace in ~3h, after that it's intuitive with occasional doc-check.

- For backend devs doing minor template updates, come with a temporary counter-DRY mindset, and you'll find less friction.

## Authorization UX

### Implicit Flow

Currently, a shortcut prompts for private key, prior to deployments, this must be restricted to session-only.

Within the UI, a hotkey lets a prompt take in private key and use it against connected wallet. Not very friendly by design.

### Wallet Flow

Certain custodial wallets may naturally allow batching, but need to be identified and evaluated against contract functionality for integration.

Following is an EIP that opens better UX across all EVM ecosystems, it should be lobbied for at community level.

[EIP-2255](https://eips.ethereum.org/EIPS/eip-2255)

projection by metamask
![](https://pbs.twimg.com/media/EIKULr5XsAASISn?format=jpg)

#### Improvement

- `wagmi` + `rainbowkit` is a neat choice but `rainbowkit` doesn't yet support many wallets.

- `wagmi` doesn't easily interoperate with `web3modal`.

## Reusable Code

- DeFileManager from `pacakges/filemanager` is built to move out of repo.

- Deploy scripts can be snippetized.

## Codebase: Structure

### src/context

App contexts mainly using Context API, includes File Manager context hook that can isolated away later.

### src/pages

Contains pages, initially single app.tsx is central and sufficient

### src/components

Components either re-used across the application, or small enough to be re-used.

### src/partials

HOCs on groups of components, could be later merged into `src/components`

### src/packages

Modules prepared or being prepared to be published standalone.

### src/styles

Contains global styling files, and tailwind imports, initially limited use for overrides.

### src/config.ts

Global configuration file is loaded into app context, allowing use of static defaults declared client-side and types for extendability.

### scripts/*

Automation scripts, CLIs incl. deployment

### main.tsx

Main entry point that mounts the app with context.

### polyfill.ts

Polyfills to non-browser-native libraries, vite does not automatically bundle these.

### utils.ts

Utility functions usable across the app

----

# Related Work

- [Filestorage.js](https://github.com/skalenetwork/filestorage.js/tree/1.0.1-develop.5)
- [Filestorage.js examples](https://docs.skale.network/filestorage.js/1.0.x/) 
- [skale-demo](https://github.com/skalenetwork/skale-demo/tree/master/file-storage)