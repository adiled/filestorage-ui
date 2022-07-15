//@ts-nocheck

import { useState, useEffect, useRef, createRef, SyntheticEvent } from 'react';

import { useFileManagerContext, ContextType } from '../context';
import { DeFile, DeDirectory, DeFileManager } from '@/services/filesystem';

import FolderIcon from '@heroicons/react/solid/FolderIcon';
import DocumentTextIcon from '@heroicons/react/outline/DocumentTextIcon';
import DocumentRemoveIcon from '@heroicons/react/solid/DocumentRemoveIcon';
import DocumentDownloadIcon from '@heroicons/react/solid/DocumentDownloadIcon';
import DotsVerticalIcon from '@heroicons/react/solid/DotsVerticalIcon';

import prettyBytes from 'pretty-bytes';

const FileManagerView = (props) => {

  const {
    fm, directory: currentDirectory, listing, searchListing,
    changeDirectory, deleteFile, deleteDirectory,
    setAddress
  } = useFileManagerContext<ContextType>();


  const tableElement = useRef<HTMLTableElement>();

  const handleRowClick = (directory: DeDirectory) => {
    changeDirectory(directory);
  }

  const makeItemTrail = (directory: DeDirectory) => {
    let trail = [];
    let item = directory;
    while (item.parent) {
      trail.push(item);
      item = item.parent;
    }
    return trail.reverse();
  }

  const [trail, setTrail] = useState<any[]>([]);

  useEffect(() => {
    setTrail(makeItemTrail(currentDirectory));
  }, [currentDirectory?.path]);


  const renderFormattedName = (item: DeFile | DeDirectory) => (
    <span className="gap-x-2 flex flex-row items-center">
      {
        item.kind === "directory"
          ? <FolderIcon className="h-5 w-5 text-blue-500" />
          : <DocumentTextIcon className="h-5 w-5 text-blue-500" />
      }
      {item.name}
    </span>
  );

  const renderFormattedSize = (item: DeFile | DeDirectory) => (
    (item.kind === "file") ? prettyBytes(item.size || 0) : "--"
  );

  const BackItem = () => (
    currentDirectory.parent ?
      <tr
        className="focus:bg-slate-100 hover:bg-slate-50"
        onClick={(e) => { handleRowClick(currentDirectory.parent) && e.stopPropagation(); }}
      >
        <td className="border-slate-800 bg-transparent">
          {renderFormattedName({ kind: "directory", name: ".." })}
        </td>
        <td className="border-slate-800 bg-transparent"></td>
        <td className="border-slate-800 bg-transparent"></td>
        <td className="border-slate-800 bg-transparent"></td>
      </tr> : <></>
  );

  const ItemActions = ({ item }) => (
    <div className="dropdown dropdown-left" onClick={(e) => e.stopPropagation()}>
      <label tabIndex="0" className="cursor-pointer">
        <DotsVerticalIcon className="h-5 w-5" />
      </label>
      <ul tabIndex="0" className="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-52">
        <li
          onClick={(e) => fm?.downloadFile(item) && tableElement.current?.querySelector(":focus").blur()}
        >
          <a><DocumentDownloadIcon className="h-5 w-5 text-blue-500" /> Download</a>
        </li>
        {
          (item.kind === "file" ? deleteFile : deleteDirectory) ?
            <li
              onClick={(e: SyntheticEvent) => {
                if (item.kind === "file") {
                  deleteFile(item)
                } else {
                  deleteDirectory(item);
                }
                tableElement.current?.querySelector(":focus").blur();
              }}
            >
              <a><DocumentRemoveIcon className="h-5 w-5 text-red-500" /> Delete</a>
            </li>
            : <></>
        }
      </ul>
    </div>
  );

  const Item = ({ item }) => (
    <tr className="focus:bg-slate-100 hover:bg-slate-50" onClick={
      (e) => {
        item.kind === "directory" && handleRowClick(item) && e.stopPropagation();
      }
    }>
      <td className="border-slate-800 bg-transparent">{renderFormattedName(item)}</td>
      <td className="border-slate-800 bg-transparent"></td>
      <td className="border-slate-800 bg-transparent">{renderFormattedSize(item)}</td>
      <td className="border-slate-800 bg-transparent"><ItemActions item={item} /></td>
    </tr>
  );

  const AddressSelect = () => (
    <input
      type="text" value={fm?.rootDirectory().name}
      onInput={(e) => {
        let { value } = e.target;
        console.log(value);
        if (value && value.length < 40) {
          return;
          //@todo more to sanity and more validation
        }
        setAddress("0x" + value);
      }}
    />
  )

  return (
    <div>
      <div className="flex flex-row gap-2 items-center border-y border-slate-800 py-4 sticky top-0 bg-white z-[1000]">
        <AddressSelect /> /
        <div className="breadcrumbs m-0 p-0">
          <ul>
            {
              trail.map(item => (
                <li className="decoration-blue-500 text-blue-500 underline" key={item.path}>
                  <a onClick={() => changeDirectory(item)}>
                    {renderFormattedName(item)}
                  </a>
                </li>
              ))
            }
          </ul>
        </div>
      </div>
      <table className="table w-full select-none relative" ref={tableElement}>
        <thead>
          <tr>
            <th className="border-b border-slate-800 bg-inherit normal-case font-medium text-base">Name</th>
            <th className="border-b border-slate-800 bg-inherit normal-case font-medium text-base">Timestamp</th>
            <th className="border-b border-slate-800 bg-inherit normal-case font-medium text-base">File Size</th>
            <th className="border-b border-slate-800 bg-inherit normal-case font-medium text-base"></th>
          </tr>
        </thead>
        <tbody>
          <BackItem />
          {
            listing.length ? listing.map((item) => <Item item={item} key={item.path} />) : null
          }
        </tbody>
      </table>
    </div >
  );
}

export default FileManagerView;