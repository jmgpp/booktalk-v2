'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEnv } from '@/context/EnvContext';
import { useLibraryStore } from '@/store/libraryStore';
import { navigateToReader } from '@/utils/nav';
import { FILE_ACCEPT_FORMATS, SUPPORTED_FILE_EXTS } from '@/services/constants';
import { isTauriAppPlatform } from '@/services/environment';

export default function HomePage() {
  const router = useRouter();
  const { envConfig, appService } = useEnv();
  const { setLibrary } = useLibraryStore();
  const [loading, setLoading] = useState(false);
  const [processingState, setProcessingState] = useState('');

  const handleFileSelect = async () => {
    setLoading(true);
    setProcessingState('Selecting file...');
    
    try {
      // Get the app service early to avoid multiple async calls
      const appServiceInstance = await envConfig.getAppService();
      let selectedFiles: string[] | File[] = [];
      
      // Use the app service's file selection method or the web fallback
      try {
        // For Tauri desktop, use the native file picker
        if (isTauriAppPlatform() && !appServiceInstance.isMobile) {
          const files = await appServiceInstance.selectFiles('Select Books', SUPPORTED_FILE_EXTS);
          if (files && files.length > 0) {
            selectedFiles = files;
          }
        } else {
          // For web or mobile, use the web file picker
          const files = await selectFilesWeb();
          if (files && files.length > 0) {
            selectedFiles = files;
          }
        }
      } catch (error) {
        console.error('Error selecting files:', error);
        // Fall back to web file picker if native selection fails
        const files = await selectFilesWeb();
        if (files && files.length > 0) {
          selectedFiles = files;
        }
      }
      
      if (selectedFiles.length === 0) {
        setLoading(false);
        setProcessingState('');
        return;
      }

      // Load books
      setProcessingState('Loading book data...');
      const libraryBooks = await appServiceInstance.loadLibraryBooks();
      
      // Process the selected file
      setProcessingState('Processing book...');
      const bookIds: string[] = [];
      for (const file of selectedFiles) {
        try {
          const book = await appServiceInstance.importBook(file, libraryBooks);
          if (book) {
            bookIds.push(book.hash);
          }
        } catch (error) {
          console.error('Failed to import book:', file, error);
        }
      }

      // Update library with the new books
      setProcessingState('Saving book data...');
      setLibrary(libraryBooks);
      await appServiceInstance.saveLibraryBooks(libraryBooks);

      // Navigate to the reader if we have valid books
      if (bookIds.length > 0) {
        setProcessingState('Opening book...');
        navigateToReader(router, bookIds);
      } else {
        setLoading(false);
        setProcessingState('');
      }
    } catch (error) {
      console.error('Error importing books:', error);
      setLoading(false);
      setProcessingState('');
      
      // Show error message to user
      try {
        const appServiceInstance = await envConfig.getAppService();
        appServiceInstance.showMessage('Error importing books. Please try again.', 'error');
      } catch (e) {
        alert('Error importing books. Please try again.');
      }
    }
  };

  const selectFilesWeb = (): Promise<File[]> => {
    return new Promise((resolve) => {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = FILE_ACCEPT_FORMATS;
      fileInput.multiple = true;
      fileInput.click();

      fileInput.onchange = () => {
        if (fileInput.files) {
          resolve(Array.from(fileInput.files));
        } else {
          resolve([]);
        }
      };
    });
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-base-200">
      <div className="text-center max-w-lg p-8 bg-base-100 rounded-2xl shadow-lg">
        <h1 className="text-4xl font-bold mb-6">BookTalk</h1>
        <p className="mb-8">
          Select an EPUB file to start reading. BookTalk provides a great reading experience with 
          social features coming soon.
        </p>
        <button 
          onClick={handleFileSelect}
          disabled={loading}
          className="btn btn-primary btn-lg rounded-xl px-8"
        >
          {loading ? 'Loading...' : 'Select an E-Book'}
        </button>
        
        {loading && (
          <div className="mt-6">
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div className="bg-primary h-2.5 rounded-full animate-pulse w-full"></div>
            </div>
            <p className="mt-2 text-sm">{processingState}</p>
          </div>
        )}
      </div>
    </div>
  );
}
