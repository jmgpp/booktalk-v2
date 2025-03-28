import { AppService } from '@/types/system';
import { READEST_WEB_BASE_URL } from './constants';

declare global {
  interface Window {
    __READEST_CLI_ACCESS?: boolean;
    __READEST_UPDATER_ACCESS?: boolean;
  }
}

export const isTauriAppPlatform = () => process.env['NEXT_PUBLIC_APP_PLATFORM'] === 'tauri';
export const isWebAppPlatform = () => process.env['NEXT_PUBLIC_APP_PLATFORM'] === 'web';
export const hasUpdater = () =>
  window.__READEST_UPDATER_ACCESS === true && !process.env['NEXT_PUBLIC_DISABLE_UPDATER'];
export const hasCli = () => window.__READEST_CLI_ACCESS === true;
export const isPWA = () => window.matchMedia('(display-mode: standalone)').matches;

// Dev API only in development mode and web platform
// with command `pnpm dev-web`
// for production build or tauri app use the production Web API
export const getAPIBaseUrl = () =>
  process.env['NODE_ENV'] === 'development' && isWebAppPlatform()
    ? '/api'
    : `${process.env['NEXT_PUBLIC_API_BASE_URL'] ?? READEST_WEB_BASE_URL}/api`;

export interface EnvConfigType {
  getAppService: () => Promise<AppService>;
}

let nativeAppService: AppService | null = null;
const getNativeAppService = async () => {
  if (!nativeAppService) {
    try {
      const { NativeAppService } = await import('@/services/nativeAppService');
      nativeAppService = new NativeAppService();
      await nativeAppService.loadSettings();
    } catch (error) {
      console.error('Failed to initialize native app service, falling back to web:', error);
      // If native service fails, fall back to web service
      return getWebAppService();
    }
  }
  return nativeAppService;
};

let webAppService: AppService | null = null;
const getWebAppService = async () => {
  if (!webAppService) {
    const { WebAppService } = await import('@/services/webAppService');
    webAppService = new WebAppService();
    await webAppService.loadSettings();
  }
  return webAppService;
};

const environmentConfig: EnvConfigType = {
  getAppService: async () => {
    if (isTauriAppPlatform()) {
      try {
        return await getNativeAppService();
      } catch (error) {
        console.error('Error initializing Tauri app service, falling back to web:', error);
        return getWebAppService();
      }
    } else {
      return getWebAppService();
    }
  },
};

export default environmentConfig;
