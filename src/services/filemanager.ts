import { ContractContext } from './../../types/abi/filestorage-1.0.1';

/**
 * @module
 * On-chain file manager for containerizing file management against users / chains
 * wrapping fs.js to serve as better isolation, type safety, reliability and intuitiveness
 * extendability to multi-fs and multi-contracts
 * consumable of stateful components in a similar manner as browser native APIs
 * @todo: rate limiting, cache management
 */

import FileStorage, {
  FileStorageDirectory,
  FileStorageFile,
} from '@skalenetwork/filestorage.js';
import { Buffer } from 'buffer';
//@ts-ignore
import sortBy from 'lodash/sortBy';
//@ts-ignore
import mime from 'mime/lite';
import Fuse from 'fuse.js';

const KIND = {
  FILE: "file",
  DIRECTORY: "directory"
}

const ROLE = {
  OWNER: 'OWNER',
  ALLOCATOR: 'ALLOCATOR',
  CHAIN_OWNER: 'CHAIN_OWNER'
}

const OPERATON = {
  UPLOAD_FILE: 'UPLOAD_FILE',
  DELETE_FILE: 'DELETE_FILE',
  DELETE_DIRECTORY: 'DELETE_DIRECTORY',
  CREATE_DIRECTORY: 'CREATE_DIRECTORY'
}

const ERROR = {
  NO_ACCOUNT: "FileManager has no signer account"
}

/**
 * Interfacing based on simpified form of web FileSystem and FileSystem Access API
 * we start without file handles
 */

export type FilePath = string;
export type DePath = string;
export type Address = string;
export type PrivateKey = string;

export interface IDeDirectory {
  kind: string;
  name: string;
  path: DePath;
  entries(): Promise<Iterable<IDeFile | IDeDirectory>>;
}

export interface IDeFile {
  kind: string;
  name: string;
  path: DePath;
  type: string;
  size: number;
  timestamp?: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

function pathToRelative(storagePath: DePath) {
  const relative = storagePath.split("/").slice(1).join('/');
  console.log("pathToRelative::", storagePath, relative);
  return relative;
}

// @todo implement
function memoize(fn: () => void) {
  const cache = new Map();
  return (...args: any) => {
    const strArgs = JSON.stringify(args);
    const result = cache.get(strArgs);
  }
}


class DeDirectory implements IDeDirectory {
  kind: string;
  name: string;
  path: DePath;
  manager: DeFileManager;
  parent?: DeDirectory;

  constructor(data: FileStorageDirectory, manager: DeFileManager, parent?: DeDirectory) {
    this.kind = KIND.DIRECTORY;
    this.name = data.name;
    this.path = pathToRelative(data.storagePath);
    this.manager = manager;
    this.parent = parent;
  }

  entries() {
    return this.manager.entriesGenerator(this);
  }
}

class DeFile implements IDeFile {
  kind: string;
  name: string;
  path: DePath;
  size: number;
  type: string;
  manager: DeFileManager;

  constructor(data: FileStorageFile, manager: DeFileManager) {
    this.kind = KIND.FILE;
    this.name = data.name;
    this.path = pathToRelative(data.storagePath);
    this.size = data.size;
    this.type = mime.getType(data.name);
    this.manager = manager;
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    const buffer = await this.manager.fs.downloadToBuffer(this.manager.rootDirectory().name + "/" + this.path);
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset, buffer.byteOffset + buffer.byteLength
    );
    return arrayBuffer;
  }
}

export type FileOrDir = DeDirectory | DeFile;

/**
 * Decentralized File Manager: Main high-level construct
 * @todo add path builder using this.address
 * @todo could possibly consider extending or melding with filestorage.js
 */

class DeFileManager {

  address: Address;
  account?: Address;
  accountPrivateKey?: PrivateKey;

  w3: Object;
  fs: FileStorage;
  contract: ContractContext;

  private rootDir: DeDirectory;

  dirLastAction: Object;

  constructor(
    w3: Object, address: Address, account?: Address, accountPrivateKey?: PrivateKey
  ) {
    this.address = address.toLowerCase();
    this.account = account;
    this.accountPrivateKey = accountPrivateKey;

    this.w3 = w3;
    this.fs = new FileStorage(w3, true);
    this.contract = (this.fs.contract as unknown) as ContractContext;

    this.dirLastAction = "";

    const addrWithoutPrefix = this.address.slice(2);

    this.rootDir = new DeDirectory({
      name: addrWithoutPrefix, // do-not-change: heavy dependency
      storagePath: addrWithoutPrefix,
      isFile: false,
    }, this);
  }

  /**
   * File Manager maintains generating filetree iterator
   */

  //@ts-ignore
  async * entriesGenerator(directory: DeDirectory): Promise<Iterable<FileOrDir>> {
    let path = (directory.parent) ? this.rootDir.name + "/" + directory.path : this.rootDir.name;
    console.log("* entriesGenerator::", path, this);
    // hit remote
    const entries = await this.loadDirectory(path);

    // map to iterable files & directories
    for (let i in entries) {
      let item = entries[i];
      // make DeFile
      if (item.isFile) {
        item = <FileStorageFile>item;
        yield new DeFile(item as FileStorageFile, this);
      }
      // recursive: make DeDirectory with entries()
      else {
        yield new DeDirectory(item as FileStorageDirectory, this, directory);
      }
    }
  }

  rootDirectory() {
    return this.rootDir;
  }

  // @todo: validate correctness
  async accountIsAdmin() {
    if (!this.account)
      return false;
    const ADMIN_ROLE = await this.contract.methods.DEFAULT_ADMIN_ROLE().call();
    return await this.contract.methods.hasRole(ADMIN_ROLE, this.account);
  }

  async accountIsAllocator() {
    if (!this.account)
      return false;
    const ALLOCATOR_ROLE = await this.contract.methods.ALLOCATOR_ROLE().call();
    return await this.contract.methods.hasRole(ALLOCATOR_ROLE, this.account).call();
  }

  async reserveSpace(address: Address, amount: number) {
    if (!this.account)
      throw Error(ERROR.NO_ACCOUNT);
    return this.fs.reserveSpace(this.account, address, amount, this.accountPrivateKey);
  }

  /**
   * @todo memoization w/ stale check
   */
  async loadDirectory(path: string): Promise<Array<FileStorageFile | FileStorageDirectory>> {
    const entries = await this.fs.listDirectory(`${path}`);
    console.log("fm:loadDirectory", entries);
    return sortBy(entries, ((o: FileStorageDirectory | FileStorageFile) => o.isFile === true));
  }

  async createDirectory(destDirectory: DeDirectory, name: string): Promise<DePath> {
    if (!this.account)
      throw Error(ERROR.NO_ACCOUNT);
    const path = (destDirectory.path === this.rootDir.path) ? name : `${destDirectory.path}/${name}`;
    console.log("path", path);
    const returnPath = await this.fs.createDirectory(this.account, path, this.accountPrivateKey);
    console.log("fm::createDirectory", returnPath);
    this.dirLastAction = `${OPERATON.CREATE_DIRECTORY}:${returnPath}`;
    return returnPath;
  }

  async deleteFile(destDirectory: DeDirectory, file: DeFile): Promise<void> {
    if (!this.account)
      throw Error(ERROR.NO_ACCOUNT);
    await this.fs.deleteFile(this.account, file.path, this.accountPrivateKey);
  }

  async deleteDirectory(directory: DeDirectory): Promise<void> {
    if (!this.account)
      throw Error(ERROR.NO_ACCOUNT);
    await this.fs.deleteDirectory(this.account, directory.path, this.accountPrivateKey);
  }

  async uploadFile(destDirectory: DeDirectory, file: File) {
    if (!this.account)
      throw Error(ERROR.NO_ACCOUNT);
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const uploadPath = (destDirectory.path === this.rootDir.path) ? file.name : `${destDirectory.path}/${file.name}`;
    let path;
    try {
      path = await this.fs.uploadFile(this.account, uploadPath, buffer, this.accountPrivateKey);
    } catch (e) {
      throw {
        file,
        error: e
      }
    }
    console.log("fm::uploadFile:", path);
    // makeshift - for outside watchers
    this.dirLastAction = `${OPERATON.UPLOAD_FILE}:${path}`;
    return path;
  }

  async downloadFile(file: DeFile) {
    return this.fs.downloadToFile(this.rootDir.name + "/" + file.path);
  }

  // depth-first
  private async iterateDirectory(
    directory: DeDirectory,
    onEntry: (entry: FileOrDir | Array<FileOrDir>) => any,
    asArray?: boolean
  ) {
    let all = [];
    //@ts-ignore
    for await (const entry of directory.entries()) {
      if (entry.kind === KIND.DIRECTORY) {
        await this.iterateDirectory(entry, onEntry);
      }
      (asArray) ? all.push(entry) : onEntry(entry);
    }
    if (asArray) {
      onEntry(all);
    }
  }

  // @todo: test and implement fuzzy query
  async search(inDirectory: DeDirectory, query: string) {

    let results: Array<FileOrDir> = [];
    console.log("filemanager::query", query);

    if (!query) return results;

    const handleList = (list: any) => {
      console.log(list);
      const fuse = new Fuse(list, { keys: ['name'] });
      const result = fuse.search(query.trim()).map(r => r.item) as FileOrDir[];
      results = [...results, ...result];
    }

    await this.iterateDirectory(inDirectory, handleList, true);
    console.log("filemanager::search_results", results);
    return results;
  }

  async occupiedSpace() {
    return (await this.fs.getOccupiedSpace(this.address));
  }

  async totalReservedSpace() {
    return (await this.fs.getTotalReservedSpace());
  }

  async totalSpace() {
    return (await this.fs.getTotalSpace());
  }

  async reservedSpace() {
    return (await this.fs.getReservedSpace(this.address));
  }
}

export {
  DeFileManager,
  DeFile,
  DeDirectory
}