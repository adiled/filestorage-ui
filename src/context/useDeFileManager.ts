import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { useInterval } from 'react-use';
import { DeFileManager, DeDirectory, DeFile, DePath, FileOrDir } from '@/services/filemanager';
import Web3 from 'web3';
import type { FileStorageDirectory, FileStorageFile } from '@skalenetwork/filestorage.js';

export type FileStatus = {
  file: File;
  path: FileStorageFile['storagePath'];
  progress: number;
  error?: {
    name: string;
    message: string;
    stack: string;
  };
};

export type State = {
  isAuthorized: boolean;
  accountRoles: [],
  fm: DeFileManager | undefined;
  directory: DeDirectory | undefined;
  listing: Array<FileOrDir>;
  searchListing: Array<FileOrDir>;
  isSearching: boolean;
  isCreatingDirectory: boolean;
  isLoadingDirectory: boolean;
  reservedSpace: number;
  occupiedSpace: number;

  activeUploads: Map<DePath, Array<FileStatus>>;
  completedUploads: Map<DePath, Array<FileStatus>>;
  failedUploads: Map<DePath, Array<FileStatus>>;
  totalUploadCount: number;
  uploadStatus: number;
};

export type Action = {
}

export const ROLE = {
  ALLOCATOR: 'ALLOCATOR',
  ADMIN: 'ADMIN'
}

const initialState: State = {
  isAuthorized: false,
  accountRoles: [],
  fm: undefined,
  directory: undefined,
  listing: [],
  searchListing: [],
  isSearching: false,
  isCreatingDirectory: false,
  isLoadingDirectory: false,
  reservedSpace: 0,
  occupiedSpace: 0,
  totalUploadCount: 0,
  activeUploads: new Map(),
  completedUploads: new Map(),
  failedUploads: new Map(),
  uploadStatus: 0,
};

const ACTION = {

  INITIALIZE: 'INITIALIZE',
  SET_ROLES: 'SET_ROLES',
  SET_AUTHORITY: 'SET_AUTHORITY',
  SET_CAPACITY: 'SET_CAPACITY',

  CHANGE_DIRECTORY: 'CHANGE_DIRECTORY',
  SET_LISTING: 'SET_LISTING',
  SET_SEARCH_LISTING: 'SET_SEARCH_LISTING',
  SET_SEARCH_LOADING: 'SET_SEARCH_LOADING',
  SET_DIRECTORY_OP: 'SET_DIRECTORY_OP',
  SET_LOADING_DIRECTORY: 'SET_LOADING_DIRECTORY',

  INIT_UPLOADS: 'INIT_UPLOADS',
  SET_DIRECTORY_UPLOADS: 'SET_DIRECTORY_UPLOADS',
  SET_UPLOAD: 'SET_UPLOAD',
  REMOVE_FROM_UPLOADS: 'REMOVE_FROM_UPLOADS', // @to_deprecate
  RESET_UPLOADS: 'RESET_UPLOADS',
  RESET_FAILED_UPLOADS: 'RESET_FAILED_UPLOADS', // @to_deprecate after prune actions
  SET_UPLOADS_PROGRESS: 'SET_UPLOADS_PROGRESS',
};

const reducer = (
  state: State,
  action: { type: string, payload: any }
): State => {
  switch (action.type) {
    case ACTION.SET_ROLES:
      return { ...state, accountRoles: action.payload }
    case ACTION.SET_AUTHORITY:
      return { ...state, isAuthorized: action.payload }
    case ACTION.INITIALIZE:
      return {
        ...initialState,
        fm: action.payload.fm,
        directory: action.payload.directory,
      }
    case ACTION.SET_CAPACITY:
      return {
        ...state,
        ...action.payload
      }

    case ACTION.CHANGE_DIRECTORY:
      return { ...state, directory: action.payload }
    case ACTION.SET_LISTING:
      return { ...state, listing: action.payload }
    case ACTION.SET_SEARCH_LOADING:
      return { ...state, isSearching: true }
    case ACTION.SET_DIRECTORY_OP:
      return { ...state, isCreatingDirectory: action.payload }
    case ACTION.SET_LOADING_DIRECTORY:
      return { ...state, isLoadingDirectory: action.payload }
    case ACTION.SET_SEARCH_LISTING:
      return { ...state, searchListing: action.payload, isSearching: false }

    // 
    case ACTION.INIT_UPLOADS:
      const { uploads, directory }: { directory: DePath, uploads: FileStatus[] } = action.payload;
      const activeUploads = new Map(state.activeUploads);
      const scopeUploads = activeUploads.get(directory) || [];
      activeUploads.set(directory, [...scopeUploads, ...uploads]);
      return {
        ...state,
        activeUploads,
        totalUploadCount: state.totalUploadCount + uploads.length
      }
    case ACTION.SET_UPLOAD:
      {
        let { directory, file }:
          { directory: DePath, file: FileStatus } = action.payload;

        const activeUploads = new Map(state.activeUploads);
        const scopeUploads = [...activeUploads.get(directory) || []];
        const index = scopeUploads.findIndex(f => f.path === file.path);

        if (index < 0) {
          scopeUploads.push(file);
        } else {
          scopeUploads[index] = file;
        }

        activeUploads.set(directory, scopeUploads);

        return {
          ...state,
          activeUploads,
        }
      }
    case ACTION.SET_DIRECTORY_UPLOADS:
      {
        let { directory, uploads }: { directory: DePath, uploads: FileStatus[] } = action.payload;
        const activeUploads = new Map(state.activeUploads);
        activeUploads.set(directory, uploads);
        return {
          ...state,
          activeUploads
        }
      }
    case ACTION.REMOVE_FROM_UPLOADS:
      {
        let { directory, path } = action.payload;
        const activeUploads = new Map(state.activeUploads);
        const currentFiles = [...activeUploads.get(directory) || []];
        const index = currentFiles?.findIndex(f => f.path === path);
        const removed = currentFiles.splice(index, 1);
        activeUploads.set(directory, currentFiles);
        return {
          ...state,
          activeUploads
        }
      }
    case ACTION.RESET_UPLOADS:
      return {
        ...state,
        totalUploadCount: 0,
        activeUploads: initialState.activeUploads
      }
    case ACTION.RESET_FAILED_UPLOADS:
      return {
        ...state,
        failedUploads: initialState.failedUploads
      }
    case ACTION.SET_UPLOADS_PROGRESS:
      return {
        ...state,
        uploadStatus: action.payload
      }
    default:
      console.log('Unregistered action', action.type);
      return state;
  }
}

function useDeFileManager(
  w3Provider: any, address: string, privateKey?: string
): [DeFileManager, State, Action] {
  const [state, dispatch]: [State, Function] = useReducer(reducer, initialState);

  const { fm, directory: cwd } = state;

  const updateCapacity = async () => {
    if (!fm) return;
    dispatch({
      type: ACTION.SET_CAPACITY,
      payload: {
        reservedSpace: await fm.reservedSpace(),
        occupiedSpace: await fm.occupiedSpace()
      }
    });
  }

  // assuming isRefresh is used outside effects
  const loadCurrentDirectory = async (isRefresh?: boolean) => {
    let dir = (isRefresh) ? cwdRef.current : cwd;
    if (!dir) return;

    !isRefresh && dispatch({
      type: ACTION.SET_LOADING_DIRECTORY,
      payload: true
    });

    const entries = await dir.entries();
    let listing = [];
    for await (let item of (entries || [])) {
      listing.push(item);
    }
    dispatch({
      type: ACTION.SET_LISTING,
      payload: listing
    });

    !isRefresh && dispatch({
      type: ACTION.SET_LOADING_DIRECTORY,
      payload: false
    });
  };

  const maybeRefreshCwd = async (directory: DeDirectory) => {
    if (!cwdRef.current) return;
    if (directory.path === cwdRef.current.path) {
      loadCurrentDirectory(true);
    }
  };

  // make-shift, integrate to interfaces already! -.-
  const absolutePath = (relativePath: string): FileStorageFile['storagePath'] => {
    if (!fm) return '';
    const absolutePath = fm.rootDirectory().name
      + ((!relativePath || relativePath.slice(0, 1) === '/') ? '' : '/')
      + relativePath;
    return absolutePath;
  }

  const cwdRef = useRef(cwd);

  // horridly frequent and expensive, better not done as side-effect
  // first candidate for improvement after upload actions are better structured
  useEffect(() => {
    const allUploads = Array.from(state.activeUploads.values()).flat() || [];
    const payload = allUploads.length === 0
      ? 0
      : (allUploads.every(upload => (upload.error || (upload.progress === 100))))
        ? 2
        : 1;
    // currently only need for flag
    dispatch({
      type: ACTION.SET_UPLOADS_PROGRESS,
      payload
    });
  }, [state.activeUploads]);

  // initialize root as current directory, roles and authorization
  useLayoutEffect(() => {
    if (!(w3Provider && address)) return;

    let account;
    if (w3Provider.selectedAddress) {
      account = Web3.utils.toChecksumAddress(w3Provider.selectedAddress || "");
    }

    const fm = new DeFileManager(w3Provider, address, account, privateKey);

    dispatch({
      type: ACTION.INITIALIZE, payload: {
        fm,
        directory: fm.rootDirectory()
      }
    });
    dispatch({
      type: ACTION.SET_AUTHORITY,
      payload: ((account || "").toLowerCase() === address.toLowerCase())
    });

    (async () => {
      let roles = [];
      if (await fm.accountIsAllocator()) {
        roles.push(ROLE.ALLOCATOR);
      }
      if (await fm.accountIsAdmin()) {
        roles.push(ROLE.ADMIN);
      }
      if (roles.length) {
        dispatch({
          action: ACTION.SET_ROLES,
          payload: roles
        });
      }
    })();

  }, [w3Provider, address, privateKey]);

  // setup storage metadata
  useLayoutEffect(() => {
    updateCapacity();
    fm?.preloadDirectories(fm.rootDirectory());
  }, [fm]);


  // keep current directory synced to ref
  useEffect(() => {
    cwdRef.current = cwd;
  }, [cwd?.path]);

  // load listing based on current directory
  useLayoutEffect(() => {
    if (!cwd) return;
    dispatch({
      type: ACTION.SET_LISTING,
      payload: []
    });
    loadCurrentDirectory();
  }, [state.fm, cwd?.path]);

  // periodically fetch relevant directory listings, update active uploads with progress
  // tested for uploads under 1mb: file being uploaded not reflected in directory listing via node
  // @todo can be better managed after some restructure involving converging remote + local state vs lookup of remote
  useInterval(async () => {
    if (!fm) return;
    for (let dirPath of state.activeUploads.keys()) {
      // no in-progress uploads for directory, skip
      const dirUploads = state.activeUploads.get(dirPath);
      if (!dirUploads?.length || dirUploads.every(upload => (upload.error || upload.progress === 100)))
        continue;

      // get remote listing for directory
      let listing: (FileStorageFile | FileStorageDirectory)[] = await fm.loadDirectory(absolutePath(dirPath), true);

      // uploads mapped to progress from remote listing
      let dirUploadsWithProgress =
        dirUploads.map(upload => {
          if (upload.error || upload.progress === 100) {
            return upload;
          }
          const match = listing.find(f => {
            console.log("interval:: upload match params", f.storagePath, '===', upload.path);
            return f.storagePath === upload.path
          });
          console.log("interval::upload match", JSON.stringify(match));
          return { ...upload, progress: (match as FileStorageFile)?.uploadingProgress || 0 }
        });

      dispatch({
        type: ACTION.SET_DIRECTORY_UPLOADS, payload: {
          directory: dirPath,
          uploads: dirUploadsWithProgress
        }
      });
    }
  }, 2000);

  const createDirectory = (fm && cwd && state.isAuthorized) &&
    (async (
      name: string,
      directory: DeDirectory = cwd
    ) => {

      // push to queue and return here

      dispatch({
        type: ACTION.SET_DIRECTORY_OP, payload: true
      });

      await fm.createDirectory(directory, name)
        .then(() => directory)
        .then(maybeRefreshCwd);

      dispatch({
        type: ACTION.SET_DIRECTORY_OP, payload: false
      });

    })

  const uploadFiles = (fm && cwd && state.isAuthorized) &&
    (async (
      files: Array<File>,
      directory: DeDirectory = cwd
    ): Promise<void> => {

      console.log("uploadFiles", files, directory);

      if (!files.length) {
        console.error("uploadFiles:: No files to upload");
        return;
      }

      // add to the active uploads with zero progress
      dispatch({
        type: ACTION.INIT_UPLOADS,
        payload: {
          directory: directory.path,
          uploads: files.map(file => ({
            file,
            path: absolutePath(`${directory.path}/${file.name}`),
            progress: 0
          } as FileStatus
          ))
        }
      });

      // upload transactions going serially until nonce management or SDK events allow otherwise
      // https://github.com/skalenetwork/filestorage-ui/issues/1

      for (let index = 0; index < files.length; index++) {

        let file = files[index];

        await fm.uploadFile(directory, file)
          .then(() => maybeRefreshCwd(directory))
          .catch(err => {
            console.error("uploadFile::failure", err);
            dispatch({
              type: ACTION.SET_UPLOAD,
              payload: {
                directory: directory.path,
                file: {
                  file: err.file,
                  path: absolutePath(`${directory.path}/${file.name}`),
                  progress: 0,
                  error: err.error
                }
              }
            });
          })
      };
    });

  const deleteFile = (fm && cwd && state.isAuthorized) && (async (file: DeFile, directory: DeDirectory = cwd) => {
    await fm.deleteFile(directory, file);
    if (!cwdRef.current) return;
    if (directory.path === cwdRef.current.path) {
      let listing = [...state.listing];
      const index = listing.findIndex(item => item.path === file.path);
      if (!index) return;
      listing.splice(index, 1);
      dispatch({
        type: ACTION.SET_LISTING,
        payload: listing
      });
    }
  });

  const deleteDirectory = (fm && cwd && state.isAuthorized) && (async (directory: DeDirectory) => {
    await fm.deleteDirectory(directory);
    if (!cwdRef.current) return;
    if (directory.parent?.path === cwdRef.current.path) {
      let listing = [...state.listing];
      const index = listing.findIndex(item => item.path === directory.path);
      if (!index) return;
      listing.splice(index, 1);
      dispatch({
        type: ACTION.SET_LISTING,
        payload: listing
      });
    }
  });

  const search = async (query: string) => {
    dispatch({
      type: ACTION.SET_SEARCH_LOADING,
    });

    if (!query) {
      dispatch({
        type: ACTION.SET_SEARCH_LISTING,
        payload: []
      });
      return;
    }

    const results = await fm?.search(cwd as DeDirectory, query);
    dispatch({
      type: ACTION.SET_SEARCH_LISTING,
      payload: results
    })
  }

  const actions = {
    uploadFiles,
    deleteFile,
    createDirectory,
    deleteDirectory,
    search,
    changeDirectory: (directory: DeDirectory) => dispatch({
      type: ACTION.CHANGE_DIRECTORY,
      payload: directory
    })
  };

  return [fm as DeFileManager, state, actions];
}

export default useDeFileManager;
