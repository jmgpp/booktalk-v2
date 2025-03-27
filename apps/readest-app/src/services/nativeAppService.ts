import {
  exists,
  mkdir,
  readTextFile,
  readFile,
  writeTextFile,
  writeFile,
  readDir,
  remove,
  copyFile,
  BaseDirectory,
} from '@tauri-apps/plugin-fs';
import { convertFileSrc } from '@tauri-apps/api/core';
import { open, message } from '@tauri-apps/plugin-dialog';
import { join, appDataDir } from '@tauri-apps/api/path';
import { type as osType } from '@tauri-apps/plugin-os';

import { Book } from '@/types/book';
import { ToastType, FileSystem, BaseDir, AppPlatform } from '@/types/system';
import { getCoverFilename } from '@/utils/book';
import { isValidURL } from '@/utils/misc';

import { BaseAppService } from './appService';
import { LOCAL_BOOKS_SUBDIR } from './constants';

declare global {
  interface Window {
    IS_ROUNDED?: boolean;
  }
}

// Determine if we're in a Tauri environment
const isTauriApp = () => {
  return process.env['NEXT_PUBLIC_APP_PLATFORM'] === 'tauri';
};

// Safely determine OS type with fallback
const getOSType = (): string => {
  if (!isTauriApp()) {
    // Web environment - detect OS from user agent
    if (typeof window !== 'undefined' && window.navigator) {
      const userAgent = window.navigator.userAgent;
      if (userAgent.indexOf('Win') !== -1) return 'windows';
      if (userAgent.indexOf('Mac') !== -1) return 'macos';
      if (userAgent.indexOf('Linux') !== -1) return 'linux';
      if (userAgent.indexOf('Android') !== -1) return 'android';
      if (userAgent.indexOf('iPhone') !== -1 || userAgent.indexOf('iPad') !== -1) return 'ios';
    }
    return 'unknown';
  }

  // Tauri environment - use the plugin but with a safety fallback
  try {
    return osType();
  } catch (error) {
    console.error('Error determining OS type using Tauri plugin:', error);
    return 'unknown';
  }
};

// Use a getter function to ensure OS_TYPE is only evaluated when needed
// and not during module initialization
const getOS_TYPE = (() => {
  let cachedOSType: string | null = null;
  
  return () => {
    if (cachedOSType === null) {
      cachedOSType = getOSType();
    }
    return cachedOSType;
  };
})();

const resolvePath = (fp: string, base: BaseDir): { baseDir: number; base: BaseDir; fp: string } => {
  switch (base) {
    case 'Settings':
      return { baseDir: BaseDirectory.AppConfig, fp, base };
    case 'Data':
      return { baseDir: BaseDirectory.AppData, fp, base };
    case 'Cache':
      return { baseDir: BaseDirectory.AppCache, fp, base };
    case 'Log':
      return { baseDir: BaseDirectory.AppLog, fp, base };
    case 'Books':
      return {
        baseDir: BaseDirectory.AppData,
        fp: `${LOCAL_BOOKS_SUBDIR}/${fp}`,
        base,
      };
    default:
      return {
        baseDir: BaseDirectory.Temp,
        fp,
        base,
      };
  }
};

export const nativeFileSystem: FileSystem = {
  getURL(path: string) {
    return isValidURL(path) ? path : convertFileSrc(path);
  },
  async getBlobURL(path: string, base: BaseDir) {
    const content = await this.readFile(path, base, 'binary');
    return URL.createObjectURL(new Blob([content]));
  },
  async copyFile(srcPath: string, dstPath: string, base: BaseDir) {
    const { fp, baseDir } = resolvePath(dstPath, base);
    await copyFile(srcPath, fp, base && { toPathBaseDir: baseDir });
  },
  async readFile(path: string, base: BaseDir, mode: 'text' | 'binary') {
    const { fp, baseDir } = resolvePath(path, base);

    return mode === 'text'
      ? (readTextFile(fp, base && { baseDir }) as Promise<string>)
      : ((await readFile(fp, base && { baseDir })).buffer as ArrayBuffer);
  },
  async writeFile(path: string, base: BaseDir, content: string | ArrayBuffer) {
    const { fp, baseDir } = resolvePath(path, base);

    return typeof content === 'string'
      ? writeTextFile(fp, content, base && { baseDir })
      : writeFile(fp, new Uint8Array(content), base && { baseDir });
  },
  async removeFile(path: string, base: BaseDir) {
    const { fp, baseDir } = resolvePath(path, base);

    return remove(fp, base && { baseDir });
  },
  async createDir(path: string, base: BaseDir, recursive = false) {
    const { fp, baseDir } = resolvePath(path, base);

    await mkdir(fp, base && { baseDir, recursive });
  },
  async removeDir(path: string, base: BaseDir, recursive = false) {
    const { fp, baseDir } = resolvePath(path, base);

    await remove(fp, base && { baseDir, recursive });
  },
  async readDir(path: string, base: BaseDir) {
    const { fp, baseDir } = resolvePath(path, base);

    const list = await readDir(fp, base && { baseDir });
    return list.map((entity) => {
      return {
        path: entity.name,
        isDir: entity.isDirectory,
      };
    });
  },
  async exists(path: string, base: BaseDir) {
    const { fp, baseDir } = resolvePath(path, base);

    try {
      const res = await exists(fp, base && { baseDir });
      return res;
    } catch {
      return false;
    }
  },
};

export class NativeAppService extends BaseAppService {
  fs = nativeFileSystem;
  appPlatform = 'tauri' as AppPlatform;
  
  // Use the getter function to ensure OS_TYPE is only evaluated when needed
  get isAppDataSandbox() { return ['android', 'ios'].includes(getOS_TYPE()); }
  get isMobile() { return ['android', 'ios'].includes(getOS_TYPE()); }
  get isAndroidApp() { return getOS_TYPE() === 'android'; }
  get isIOSApp() { return getOS_TYPE() === 'ios'; }
  get hasTrafficLight() { return getOS_TYPE() === 'macos'; }
  get hasWindow() { return !(getOS_TYPE() === 'ios' || getOS_TYPE() === 'android'); }
  get hasWindowBar() { return !(getOS_TYPE() === 'ios' || getOS_TYPE() === 'android'); }
  get hasContextMenu() { return !(getOS_TYPE() === 'ios' || getOS_TYPE() === 'android'); }
  get hasRoundedWindow() { return !(getOS_TYPE() === 'ios' || getOS_TYPE() === 'android') && !!window.IS_ROUNDED; }
  get hasSafeAreaInset() { return getOS_TYPE() === 'ios' || getOS_TYPE() === 'android'; }
  get hasHaptics() { return getOS_TYPE() === 'ios' || getOS_TYPE() === 'android'; }
  get hasSysFontsList() { return !(getOS_TYPE() === 'ios' || getOS_TYPE() === 'android'); }

  override resolvePath(fp: string, base: BaseDir): { baseDir: number; base: BaseDir; fp: string } {
    return resolvePath(fp, base);
  }

  async getInitBooksDir(): Promise<string> {
    try {
      if (!isTauriApp()) {
        // In web environment, just return the local books directory
        return LOCAL_BOOKS_SUBDIR;
      }
      return join(await appDataDir(), LOCAL_BOOKS_SUBDIR);
    } catch (error) {
      console.error("Error getting books directory, falling back to local path:", error);
      return LOCAL_BOOKS_SUBDIR;
    }
  }

  async selectFiles(name: string, extensions: string[]): Promise<string[]> {
    const selected = await open({
      multiple: true,
      filters: [{ name, extensions }],
    });
    return Array.isArray(selected) ? selected : selected ? [selected] : [];
  }

  async showMessage(
    msg: string,
    kind: ToastType = 'info',
    title?: string,
    okLabel?: string,
  ): Promise<void> {
    await message(msg, { kind, title, okLabel });
  }

  getCoverImageUrl = (book: Book): string => {
    return this.fs.getURL(`${this.localBooksDir}/${getCoverFilename(book)}`);
  };

  getCoverImageBlobUrl = async (book: Book): Promise<string> => {
    return this.fs.getBlobURL(`${this.localBooksDir}/${getCoverFilename(book)}`, 'None');
  };
}
